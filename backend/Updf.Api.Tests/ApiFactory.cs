using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Updf.Api.Tests;

/// <summary>The API with the rate limit raised, so tests sharing one host don't throttle each other.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public Dictionary<string, string?> Settings { get; } = new() { ["Export:ExportsPerMinute"] = "100000" };

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(Settings));
}

public static class ExportRequests
{
    /// <summary>Posts an export the way a browser does, with the file name as raw UTF-8. Leaves out null parts.</summary>
    public static Task<HttpResponseMessage> PostExport(this HttpClient client, byte[]? pdf, string? edits, string fileName = "test.pdf")
    {
        var content = new MultipartFormDataContent { HeaderEncodingSelector = (_, _) => Encoding.UTF8 };
        if (pdf is not null)
        {
            var file = new ByteArrayContent(pdf);
            file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            file.Headers.TryAddWithoutValidation("Content-Disposition", $"form-data; name=\"file\"; filename=\"{fileName}\"");
            content.Add(file);
        }
        if (edits is not null)
        {
            content.Add(new StringContent(edits), "edits");
        }
        return client.PostAsync("/api/pdf/export", content, TestContext.Current.CancellationToken);
    }
}
