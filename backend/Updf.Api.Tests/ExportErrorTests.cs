using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Updf.Api.Pdf;
using static Updf.Api.Tests.TestPdfs;

namespace Updf.Api.Tests;

public class ExportErrorTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string FrontendOrigin = "http://localhost:3000";
    private static readonly string ValidEdits = ToJson(Edits(Edit(0, 40, 60, ["Hello"])));

    public static TheoryData<string, byte[]?, string?, HttpStatusCode, string> Errors => new()
    {
        { "invalid edits", Blank(1), ToJson(Edits(Edit(5, 40, 60, ["Hello"]))), HttpStatusCode.BadRequest, "invalid-edits" },
        { "missing edits", Blank(1), null, HttpStatusCode.BadRequest, "invalid-edits" },
        { "unsupported characters", Blank(1), ToJson(Edits(Edit(0, 40, 60, ["你好 😀"]))), HttpStatusCode.BadRequest, "unsupported-characters" },
        { "not a PDF", Text(), ValidEdits, HttpStatusCode.UnsupportedMediaType, "not-a-pdf" },
        { "no file", null, ValidEdits, HttpStatusCode.UnsupportedMediaType, "not-a-pdf" },
        { "password-protected", Encrypted("user", "owner"), ValidEdits, HttpStatusCode.UnprocessableEntity, "pdf-encrypted" },
        { "owner password only", Encrypted(null, "owner"), ValidEdits, HttpStatusCode.UnprocessableEntity, "pdf-encrypted" },
        { "101 pages", Blank(101), ValidEdits, HttpStatusCode.UnprocessableEntity, "pdf-too-many-pages" },
        { "damaged", Truncated(), ValidEdits, HttpStatusCode.UnprocessableEntity, "pdf-unreadable" },
    };

    [Theory]
    [MemberData(nameof(Errors))]
    public async Task Errors_return_problem_details_with_a_stable_code(string reason, byte[]? pdf, string? edits, HttpStatusCode status, string code)
    {
        _ = reason;
        var response = await factory.CreateClient().PostExport(pdf, edits);

        await AssertProblem(response, status, code);
    }

    [Fact]
    public async Task A_file_over_25_MB_is_rejected()
    {
        // Built here rather than as theory data, so test runners don't serialize 25 MB per test case.
        byte[] pdf = [.. "%PDF-"u8, .. new byte[25 * 1024 * 1024]];

        var response = await factory.CreateClient().PostExport(pdf, ValidEdits);

        await AssertProblem(response, HttpStatusCode.RequestEntityTooLarge, "file-too-large");
    }

    [Fact]
    public async Task A_request_that_is_not_a_form_is_rejected_as_not_a_pdf()
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/pdf/export", new { edits = ValidEdits }, TestContext.Current.CancellationToken);

        await AssertProblem(response, HttpStatusCode.UnsupportedMediaType, "not-a-pdf");
    }

    [Fact]
    public async Task The_file_is_checked_before_the_edits()
    {
        var response = await factory.CreateClient().PostExport(Text(), "not json");

        await AssertProblem(response, HttpStatusCode.UnsupportedMediaType, "not-a-pdf");
    }

    [Fact]
    public async Task More_than_10_exports_a_minute_from_one_address_are_rate_limited()
    {
        using var defaults = new WebApplicationFactory();
        var client = defaults.CreateClient();

        for (var i = 0; i < 10; i++)
        {
            Assert.NotEqual(HttpStatusCode.TooManyRequests, (await client.PostExport(null, null)).StatusCode);
        }
        await AssertProblem(await client.PostExport(Blank(1), ValidEdits), HttpStatusCode.TooManyRequests, "rate-limited");
    }

    [Fact]
    public async Task Processing_over_the_timeout_is_stopped()
    {
        using var slow = new ApiFactory();
        slow.Settings["Export:Timeout"] = "00:00:00.001";
        var edits = Enumerable.Range(0, 1000).Select(i => Edit(i % 100, 40, 20 + i / 100 * 70, ["Zażółć gęślą jaźń"])).ToArray();

        var response = await slow.CreateClient().PostExport(Blank(100), ToJson(Edits(edits)));

        await AssertProblem(response, HttpStatusCode.ServiceUnavailable, "processing-timeout");
    }

    [Fact]
    public async Task Unexpected_errors_return_500_with_a_request_id()
    {
        var failing = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IStartupFilter, FailingEndpoint>()));

        var response = await failing.CreateClient().GetAsync("/test/fail", TestContext.Current.CancellationToken);

        await AssertProblem(response, HttpStatusCode.InternalServerError, "unexpected");
    }

    [Fact]
    public async Task Requests_over_26_MB_are_refused_before_they_are_fully_read()
    {
        var ct = TestContext.Current.CancellationToken;
        using var kestrel = new ApiFactory();
        kestrel.UseKestrel(0);
        kestrel.StartServer();
        var address = kestrel.CreateClient().BaseAddress!;

        // Send only the headers of a 27 MB request. The server must answer without waiting for the body.
        using var tcp = new System.Net.Sockets.TcpClient();
        await tcp.ConnectAsync(address.Host, address.Port, ct);
        var stream = tcp.GetStream();
        await stream.WriteAsync(Encoding.ASCII.GetBytes(
            $"POST /api/pdf/export HTTP/1.1\r\nHost: {address.Authority}\r\nContent-Type: multipart/form-data; boundary=x\r\n" +
            $"Content-Length: {27 * 1024 * 1024}\r\n\r\n"), ct);
        var response = await new StreamReader(stream).ReadToEndAsync(ct).WaitAsync(TimeSpan.FromSeconds(10), ct);

        Assert.StartsWith("HTTP/1.1 413", response);
        Assert.Contains("\"code\":\"file-too-large\"", response);
    }

    [Fact]
    public async Task Cors_allows_only_the_frontend_origin()
    {
        var client = factory.CreateClient();

        var allowed = await client.SendAsync(Preflight(FrontendOrigin), TestContext.Current.CancellationToken);
        var denied = await client.SendAsync(Preflight("https://evil.example"), TestContext.Current.CancellationToken);

        Assert.Equal([FrontendOrigin], allowed.Headers.GetValues("Access-Control-Allow-Origin"));
        Assert.False(denied.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Cors_lets_the_browser_read_the_download_name_and_errors()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", FrontendOrigin);

        var success = await client.PostExport(Blank(1), ValidEdits);
        var error = await client.PostExport(Text(), ValidEdits);

        Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        Assert.Contains("Content-Disposition", success.Headers.GetValues("Access-Control-Expose-Headers"));
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, error.StatusCode);
        Assert.Equal([FrontendOrigin], error.Headers.GetValues("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Logs_and_errors_never_contain_file_contents_or_edit_text()
    {
        const string secret = "SECRET-7f3a";
        var logs = new CapturingLoggerProvider();
        var logged = factory.WithWebHostBuilder(b => b.ConfigureLogging(l => l.AddProvider(logs).SetMinimumLevel(LogLevel.Debug)));
        var client = logged.CreateClient();

        HttpResponseMessage[] responses =
        [
            await client.PostExport(Blank(1), ToJson(Edits(Edit(0, 40, 60, [secret])))),
            await client.PostExport(Blank(1), ToJson(Edits(Edit(0, 40, 60, [secret + " 你好"])))),
            await client.PostExport(Blank(1), ToJson(Edits(Edit(9, 40, 60, [secret])))),
            await client.PostExport(Blank(1), $$"""{"version":1,"edits":[{"lines":["{{secret}}"]"""),
            await client.PostExport(Encoding.UTF8.GetBytes(secret), ValidEdits),
            await client.PostExport(Encoding.UTF8.GetBytes("%PDF-1.7 " + secret), ValidEdits),
        ];

        foreach (var response in responses.Skip(1))
        {
            Assert.DoesNotContain(secret, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        }
        Assert.NotEmpty(logs.Entries);
        Assert.DoesNotContain(logs.Entries, entry => entry.Contains(secret, StringComparison.Ordinal));
    }

    private static HttpRequestMessage Preflight(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/pdf/export");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        return request;
    }

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("requestId").GetString()));
    }

    private sealed class WebApplicationFactory : Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>;

    /// <summary>Adds an endpoint that throws, after the app's own pipeline so the app's error handling applies.</summary>
    private sealed class FailingEndpoint : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.Run(_ => throw new InvalidOperationException("Simulated failure."));
        };
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<string> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new Logger(Entries);

        public void Dispose()
        {
        }

        private sealed class Logger(ConcurrentQueue<string> entries) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                entries.Enqueue($"{formatter(state, exception)} {state} {exception}");
        }
    }
}
