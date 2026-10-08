using PdfSharp.Pdf.Content;
using PdfSharp.Pdf.Content.Objects;
using PdfSharp.Pdf.IO;
using Updf.Api.Pdf;
using static Updf.Api.Tests.TestPdfs;
using PigDocument = UglyToad.PdfPig.PdfDocument;

namespace Updf.Api.Tests;

public class OriginalFontTests
{
    private const double Tolerance = 0.05;

    // Arimo's ascent, underline offset and thickness per em, from its hhea and post tables.
    private const double ArimoAscent = 1854 / 2048.0;

    private readonly PdfEditor _editor = new();

    private static byte[] FontsPdf => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", "fonts.pdf"));

    // The fixture draws its fonts with WinAnsi codes, and no space glyph: PDFsharp moves the text instead.
    private static int[] WinAnsiCodes(string line) => line.Select(c => c == ' ' ? -1 : c).ToArray();

    [Fact]
    public void A_line_replaced_in_its_original_font_matches_the_original()
    {
        const string line = "Arimo regular line";
        var original = Letters(FontsPdf).Take(line.Replace(" ", "").Length).ToList();
        var edit = Edit(0, 72, 96 - 12 * ArimoAscent, [line], Style("Arimo", size: 12)) with
        {
            PdfFont = new PdfFont(original[0].FontName!, [WinAnsiCodes(line)]),
        };

        var drawn = Letters(Export(FontsPdf, edit)).TakeLast(original.Count).ToList();

        Assert.Equal(line.Replace(" ", ""), string.Concat(drawn.Select(l => l.Value)));
        Assert.All(drawn.Zip(original), pair =>
        {
            Assert.Equal(pair.Second.FontName, pair.First.FontName);
            Assert.Equal(pair.Second.StartBaseLine.X, pair.First.StartBaseLine.X, Tolerance);
            Assert.Equal(pair.Second.StartBaseLine.Y, pair.First.StartBaseLine.Y, Tolerance);
        });
    }

    [Fact]
    public void A_kerned_line_is_written_with_its_kerning()
    {
        // kerned.pdf's fourth line, "You can edit these lines", as LibreOffice wrote it: one-byte codes, with "o" moved
        // towards "Y" in the TJ array.
        const string line = "You can edit these lines";
        var kerned = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", "kerned.pdf"));
        var shown = ContentReader.ReadContent(PdfReader.Open(new MemoryStream(kerned)).Pages[0]).OfType<COperator>()
            .Where(op => op.OpCode.OpCodeName is OpCodeName.Tj or OpCodeName.TJ).ElementAt(3).Operands[0];
        var (codes, kerning) = (new List<int>(), new List<double>());
        foreach (var item in shown is CArray array ? array : [shown])
        {
            if (item is CString text)
            {
                codes.AddRange(text.Value.Select(c => (int)c));
                kerning.AddRange(text.Value.Select(_ => 0.0));
            }
            else
            {
                kerning[^1] = item is CInteger integer ? integer.Value : ((CReal)item).Value;
            }
        }
        Assert.Equal(line.Length, codes.Count);
        Assert.Contains(kerning, k => k > 0);
        var original = Letters(kerned).GroupBy(l => Math.Round(l.StartBaseLine.Y, 1))
            .Select(g => g.ToList()).Single(g => string.Concat(g.Select(l => l.Value)) == line.Replace(" ", ""));
        var page = PigDocument.Open(kerned).GetPage(1);
        var edit = Edit(0, original[0].StartBaseLine.X, page.Height - original[0].StartBaseLine.Y - 12 * ArimoAscent, [line], Style("Arimo", size: 12)) with
        {
            PdfFont = new PdfFont(original[0].FontName!, [codes], [kerning]),
        };

        var drawn = Letters(Export(kerned, edit)).TakeLast(original.Count).ToList();

        Assert.All(drawn.Zip(original), pair =>
        {
            Assert.Equal(pair.Second.Value, pair.First.Value);
            Assert.Equal(pair.Second.StartBaseLine.X, pair.First.StartBaseLine.X, Tolerance);
            Assert.Equal(pair.Second.StartBaseLine.Y, pair.First.StartBaseLine.Y, Tolerance);
        });
    }

    [Fact]
    public void Text_is_written_in_a_composite_font_with_two_byte_codes()
    {
        // The editor's own output uses Identity-H composite fonts.
        var first = _editor.Apply(PdfReader.Open(new MemoryStream(Blank(1)), PdfDocumentOpenMode.Modify), Edits(Edit(0, 40, 60, ["Abc"], Style("Arimo"))), TestContext.Current.CancellationToken);
        var font = Letters(first)[0].FontName!;
        var shown = ContentReader.ReadContent(PdfReader.Open(new MemoryStream(first)).Pages[0])
            .OfType<COperator>().First(op => op.OpCode.OpCodeName is OpCodeName.Tj).Operands.OfType<CString>().Single().Value;
        var codes = Enumerable.Range(0, shown.Length / 2).Select(i => shown[2 * i] << 8 | shown[2 * i + 1]).ToArray();

        var drawn = Letters(Export(first, Edit(0, 40, 200, ["Abc"], Style("Noto Sans")) with { PdfFont = new PdfFont(font, [codes]) }));

        Assert.Equal("AbcAbc", string.Concat(drawn.Select(l => l.Value)));
        Assert.All(drawn, l => Assert.Equal(font, l.FontName));
    }

    [Fact]
    public void Without_the_font_on_the_page_the_text_is_drawn_in_the_style_font()
    {
        var edit = Edit(0, 40, 60, ["Abc"], Style("Tinos")) with { PdfFont = new PdfFont("ABCDEF+Missing", [[1, 2, 3]]) };

        var drawn = Letters(Export(Blank(1), edit));

        Assert.Equal("Abc", string.Concat(drawn.Select(l => l.Value)));
        Assert.All(drawn, l => Assert.Contains("Tinos", l.FontName));
    }

    [Fact]
    public void Forms_that_contain_themselves_are_searched_once()
    {
        var edit = Edit(0, 40, 60, ["Abc"], Style("Tinos")) with { PdfFont = new PdfFont("ABCDEF+Missing", [[1, 2, 3]]) };

        Assert.Equal("Abc", string.Concat(Letters(Export(SelfContainingForm(), edit)).Select(l => l.Value)));
    }

    [Fact]
    public void Text_in_the_original_font_is_underlined_like_text_in_the_style_font()
    {
        const string line = "Arimo";
        var font = Letters(FontsPdf)[0].FontName!;
        var edit = Edit(0, 300, 400, [line], Style("Arimo", size: 12, underline: true)) with { PdfFont = new PdfFont(font, [WinAnsiCodes(line)]) };

        using var output = PigDocument.Open(Export(FontsPdf, edit));
        var page = output.GetPage(1);
        var drawn = page.Letters.TakeLast(line.Length).ToList();

        var rule = page.Paths.Last().GetBoundingRectangle()!.Value;
        var baseline = page.Height - drawn[0].StartBaseLine.Y;
        Assert.Equal(400 + 12 * ArimoAscent, baseline, Tolerance);
        Assert.Equal(baseline + 12 * 217 / 2048.0, page.Height - rule.Top, Tolerance);
        Assert.Equal(12 * 150 / 2048.0, rule.Height, Tolerance);
        Assert.Equal(300, rule.Left, Tolerance);
        Assert.Equal(drawn[^1].EndBaseLine.X, rule.Right, Tolerance);
    }

    [Fact]
    public void Covers_are_drawn_under_text_in_the_original_font()
    {
        var font = Letters(FontsPdf)[0].FontName!;
        var edit = Edit(0, 72, 81, ["Arimo"], Style("Arimo", size: 12), new Cover(70, 80, 100, 20, "#FFFFFF")) with
        {
            PdfFont = new PdfFont(font, [WinAnsiCodes("Arimo")]),
        };

        var ops = ContentReader.ReadContent(PdfReader.Open(new MemoryStream(Export(FontsPdf, edit))).Pages[0])
            .OfType<COperator>().Select(op => op.OpCode.OpCodeName).ToList();
        Assert.True(ops.LastIndexOf(OpCodeName.f) < ops.LastIndexOf(OpCodeName.TJ));
    }

    private byte[] Export(byte[] pdf, TextEdit edit) =>
        _editor.Apply(PdfReader.Open(new MemoryStream(pdf), PdfDocumentOpenMode.Modify), Edits(edit), TestContext.Current.CancellationToken);

    private static List<UglyToad.PdfPig.Content.Letter> Letters(byte[] pdf)
    {
        using var document = PigDocument.Open(pdf);
        return document.GetPage(1).Letters.Where(l => l.Value != " ").ToList();
    }
}
