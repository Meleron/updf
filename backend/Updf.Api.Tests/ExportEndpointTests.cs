using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using Updf.Api.Pdf;
using static Updf.Api.Tests.TestPdfs;
using PigDocument = UglyToad.PdfPig.PdfDocument;

namespace Updf.Api.Tests;

public class ExportEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("report.pdf", "report-edited.pdf")]
    [InlineData("Raport roczny – zażółć gęślą jaźń.pdf", "Raport roczny – zażółć gęślą jaźń-edited.pdf")]
    public async Task Returns_the_edited_pdf_as_a_named_attachment(string fileName, string downloadName)
    {
        var response = await Export(Blank(1), fileName, Edits(Edit(0, 40, 60, ["Zażółć"])));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        var disposition = response.Content.Headers.ContentDisposition!;
        Assert.Equal("attachment", disposition.DispositionType);
        Assert.Equal(downloadName, disposition.FileNameStar);
        using var pdf = PigDocument.Open(await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Equal("Zażółć", pdf.GetPage(1).Text);
    }

    [Fact]
    public async Task Simultaneous_exports_all_succeed()
    {
        var responses = await Task.WhenAll(Enumerable.Range(0, 12).Select(i =>
            Export(Blank(3), $"doc{i}.pdf", Edits(Edit(i % 3, 40, 60, [$"Export {i}"], Style((FontKind)(i % 3), bold: i % 2 == 0))))));

        for (var i = 0; i < responses.Length; i++)
        {
            Assert.Equal(HttpStatusCode.OK, responses[i].StatusCode);
            using var pdf = PigDocument.Open(await responses[i].Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
            Assert.Equal($"Export {i}", string.Join(' ', pdf.GetPage(i % 3 + 1).GetWords().Select(w => w.Text)));
        }
    }

    [Fact]
    public async Task The_largest_allowed_job_finishes_within_the_timeout()
    {
        var edits = Enumerable.Range(0, 1000).Select(i => Edit(
            page: i % 100, x: 40, y: 20 + i / 100 * 70,
            lines: ["Zażółć gęślą jaźń", "Съешь же ещё", "Ξεσκεπάζω"],
            style: Style((FontKind)(i % 3), size: 12, bold: i % 2 == 0, italic: i % 4 < 2, underline: i % 5 == 0),
            cover: new Cover(38, 18 + i / 100 * 70, 200, 60, "#FFFFFF"))).ToArray();

        var stopwatch = Stopwatch.StartNew();
        var response = await Export(Blank(100), "big.pdf", Edits(edits));
        stopwatch.Stop();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.InRange(stopwatch.Elapsed, TimeSpan.Zero, TimeSpan.FromSeconds(30));
        using var pdf = PigDocument.Open(await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Equal(100, pdf.NumberOfPages);
    }

    [Fact]
    public async Task A_form_keeps_its_fields_after_editing()
    {
        var form = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", "form.pdf"));

        var response = await Export(form, "form.pdf", Edits(Edit(0, 72, 200, ["Signed"])));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var pdf = PigDocument.Open(await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Contains("Signed", pdf.GetPage(1).Text);
        Assert.True(pdf.TryGetForm(out var fields));
        Assert.Equal("name", Assert.Single(fields.Fields).Information.PartialName);
    }

    [Fact]
    public async Task Uploads_are_processed_without_writing_temp_files()
    {
        var ct = TestContext.Current.CancellationToken;
        var pdf = Large(256 * 1024);
        Assert.True(pdf.Length > 64 * 1024, "The upload must exceed ASP.NET's default in-memory buffer of 64 KB.");

        var tempDirectory = Path.GetTempPath();
        var sentinel = $"updf-sentinel-{Guid.NewGuid()}";
        var sentinelSeen = new TaskCompletionSource();
        var created = new ConcurrentQueue<string>();
        using var watcher = new FileSystemWatcher(tempDirectory) { EnableRaisingEvents = true };
        watcher.Created += (_, e) =>
        {
            if (e.Name == sentinel)
            {
                sentinelSeen.TrySetResult();
            }
            else
            {
                created.Enqueue(e.Name!);
            }
        };

        var response = await Export(pdf, "large.pdf", Edits(Edit(0, 40, 60, ["Hello"])));

        // Events arrive in order, so once the sentinel is reported every earlier file creation has been too.
        var sentinelPath = Path.Combine(tempDirectory, sentinel);
        await File.WriteAllTextAsync(sentinelPath, "", ct);
        await sentinelSeen.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
        File.Delete(sentinelPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(created, name => name.EndsWith(".tmp", StringComparison.Ordinal));
    }

    private Task<HttpResponseMessage> Export(byte[] pdf, string fileName, EditDocument edits) =>
        factory.CreateClient().PostExport(pdf, ToJson(edits), fileName);
}
