using PdfSharp.Pdf.Content;
using PdfSharp.Pdf.Content.Objects;
using PdfSharp.Pdf.IO;
using Updf.Api.Pdf;
using UglyToad.PdfPig.Content;
using static Updf.Api.Tests.TestPdfs;
using PigDocument = UglyToad.PdfPig.PdfDocument;

namespace Updf.Api.Tests;

public class PdfEditorTests
{
    // Noto Sans metrics: ascender 1069 and line spacing 1362 per 1000 units of em.
    private const double SansAscent = 1.069;
    private const double SansLineHeight = 1.362;
    private const double Tolerance = 0.05;

    private readonly PdfEditor _editor = new();

    public static TheoryData<string, byte[]> PageSetups => new()
    {
        { "normal", Blank(A4) },
        { "cropped with offset media box", Blank(new PageSetup([100, 200, 700, 1000], [150, 250, 650, 950])) },
        { "rotated 90", Blank(new PageSetup([100, 200, 700, 1000], [150, 250, 650, 950], 90)) },
        { "rotated 180", Blank(new PageSetup([100, 200, 700, 1000], [150, 250, 650, 950], 180)) },
        { "rotated 270", Blank(new PageSetup([-50, -40, 750, 560], [0, 0, 700, 500], 270)) },
        { "landscape rotated 90", Blank(new PageSetup([0, 0, 842, 595], null, 90)) },
        { "crop larger than media box", Blank(new PageSetup([0, 0, 600, 800], [-100, -100, 500, 700])) },
        { "inherited rotation and crop", InheritedRotationAndCrop() },
    };

    [Theory]
    [MemberData(nameof(PageSetups))]
    public void Text_is_placed_upright_at_the_position_on_the_displayed_page(string setup, byte[] pdf)
    {
        _ = setup;
        using var output = Export(pdf, Edit(0, 40, 60, ["AB"]));
        var page = output.GetPage(1);
        var (a, b) = (page.Letters[0], page.Letters[1]);

        var (ax, ay) = Display(page, a.StartBaseLine);
        var (bx, by) = Display(page, b.StartBaseLine);
        Assert.Equal(40, ax, Tolerance);
        Assert.Equal(60 + 20 * SansAscent, ay, Tolerance);
        Assert.Equal(ay, by, Tolerance);
        Assert.True(bx > ax);
    }

    [Fact]
    public void Text_lands_on_the_requested_page()
    {
        using var output = Export(Blank(3), Edit(1, 40, 60, ["Hello"]));

        Assert.Empty(output.GetPage(1).Letters);
        Assert.Equal("Hello", output.GetPage(2).Text);
        Assert.Empty(output.GetPage(3).Letters);
    }

    [Theory]
    [InlineData(FontKind.Sans, false, false, "Noto Sans Regular")]
    [InlineData(FontKind.Sans, true, true, "Noto Sans,BoldItalic")]
    [InlineData(FontKind.Serif, false, true, "Noto Serif,Italic")]
    [InlineData(FontKind.Serif, true, false, "Noto Serif,Bold")]
    [InlineData(FontKind.Mono, true, false, "Noto Sans Mono,Bold")]
    public void Text_uses_the_chosen_font(FontKind font, bool bold, bool italic, string fontName)
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["Abc"], Style(font, bold: bold, italic: italic)));

        Assert.All(output.GetPage(1).Letters, l => Assert.EndsWith("+" + fontName, l.FontName));
    }

    [Fact]
    public void Mono_italic_is_slanted()
    {
        using var output = Export(Blank(1),
            Edit(0, 40, 60, ["I"], Style(FontKind.Mono)),
            Edit(0, 40, 160, ["I"], Style(FontKind.Mono, italic: true)));
        var (upright, slanted) = (output.GetPage(1).Letters[0], output.GetPage(1).Letters[1]);

        Assert.Equal(upright.BoundingBox.TopLeft.X, upright.BoundingBox.BottomLeft.X, Tolerance);
        Assert.True(slanted.BoundingBox.TopLeft.X > slanted.BoundingBox.BottomLeft.X + 1);
    }

    [Fact]
    public void Text_uses_the_chosen_size_and_colour()
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["Abc"], Style(size: 13, color: "#4F46E5")));

        Assert.All(output.GetPage(1).Letters, l =>
        {
            Assert.Equal(13, l.PointSize, Tolerance);
            // PDFsharp writes colour components with three decimals.
            var (r, g, b) = l.Color.ToRGBValues();
            Assert.Equal(0x4F / 255d, r, 0.001);
            Assert.Equal(0x46 / 255d, g, 0.001);
            Assert.Equal(0xE5 / 255d, b, 0.001);
        });
    }

    [Fact]
    public void Underlined_text_has_a_line_below_its_baseline()
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["Underlined"], Style(underline: true)));
        var page = output.GetPage(1);
        var baseline = Display(page, page.Letters[0].StartBaseLine).Y;

        var line = Assert.Single(page.Paths).GetBoundingRectangle()!.Value;
        Assert.Equal(40, line.Left, Tolerance);
        Assert.Equal(page.Letters[^1].EndBaseLine.X, line.Right, 0.5);
        Assert.InRange(page.Height - line.Top, baseline, baseline + 5);
    }

    [Fact]
    public void Text_without_underline_has_no_line()
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["Plain"]));

        Assert.Empty(output.GetPage(1).Paths);
    }

    [Theory]
    [InlineData(TextAlign.Left, 0)]
    [InlineData(TextAlign.Center, 0.5)]
    [InlineData(TextAlign.Right, 1)]
    public void Lines_are_aligned_within_the_widest_line(TextAlign align, double share)
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["WWWWW", "i"], Style(align: align)));
        var letters = output.GetPage(1).Letters;
        var wide = letters.Take(5).ToList();
        var narrow = letters[5];

        var boxWidth = wide[^1].EndBaseLine.X - wide[0].StartBaseLine.X;
        var narrowWidth = narrow.EndBaseLine.X - narrow.StartBaseLine.X;
        Assert.Equal(40, wide[0].StartBaseLine.X, Tolerance);
        Assert.Equal(40 + (boxWidth - narrowWidth) * share, narrow.StartBaseLine.X, Tolerance);
    }

    [Fact]
    public void Lines_use_the_font_line_spacing_and_empty_lines_are_kept()
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["A", "", "B"]));
        var page = output.GetPage(1);

        var a = Display(page, page.Letters[0].StartBaseLine).Y;
        var b = Display(page, page.Letters[1].StartBaseLine).Y;
        Assert.Equal(2 * 20 * SansLineHeight, b - a, Tolerance);
    }

    [Fact]
    public void Cover_is_drawn_in_its_colour_at_its_position()
    {
        using var output = Export(Blank(1), Edit(0, 40, 60, ["New"], cover: new Cover(30, 50, 200, 30, "#FF0000")));
        var page = output.GetPage(1);

        var cover = Assert.Single(page.Paths);
        var bounds = cover.GetBoundingRectangle()!.Value;
        Assert.Equal((30, 50, 230, 80), (bounds.Left, page.Height - bounds.Top, bounds.Right, page.Height - bounds.Bottom));
        Assert.True(cover.IsFilled);
        Assert.Equal((1d, 0d, 0d), cover.FillColor!.ToRGBValues());
    }

    [Fact]
    public void Covers_are_drawn_under_all_text_on_the_page()
    {
        var pdf = _editor.Apply(Open(Blank(1)), Edits(
            Edit(0, 40, 60, ["First"]),
            Edit(0, 300, 60, ["Second"], cover: new Cover(30, 50, 200, 30, "#FFFFFF"))), TestContext.Current.CancellationToken);

        var ops = ContentReader.ReadContent(PdfReader.Open(new MemoryStream(pdf)).Pages[0])
            .OfType<COperator>().Select(op => op.OpCode.OpCodeName).ToList();
        Assert.True(ops.LastIndexOf(OpCodeName.f) < ops.IndexOf(OpCodeName.BT));
    }

    [Fact]
    public void Polish_cyrillic_and_greek_text_survives_and_fonts_are_embedded()
    {
        string[] lines = ["Zażółć gęślą jaźń ZAŻÓŁĆ", "Съешь же ещё этих булок", "Ξεσκεπάζω την ψυχοφθόρα"];
        var pdf = _editor.Apply(Open(Blank(1)), Edits(
            Edit(0, 40, 60, lines),
            Edit(0, 40, 200, lines, Style(FontKind.Serif, italic: true)),
            Edit(0, 40, 340, lines, Style(FontKind.Mono, bold: true))), TestContext.Current.CancellationToken);

        using var output = PigDocument.Open(pdf);
        var words = output.GetPage(1).GetWords().Select(w => w.Text);
        var expected = string.Join(' ', lines).Split(' ');
        Assert.Equal([.. expected, .. expected, .. expected], words);
        Assert.All(output.GetPage(1).Letters, l => Assert.Matches("^[A-Z]{6}\\+Noto ", l.FontName));
        Assert.Equal(3, CountEmbeddedFonts(pdf));
    }

    private static int CountEmbeddedFonts(byte[] pdf)
    {
        var fonts = PdfReader.Open(new MemoryStream(pdf)).Pages[0].Resources.Elements.GetDictionary("/Font")!;
        return fonts.Elements.Keys
            .Select(key => fonts.Elements.GetDictionary(key)!.Elements.GetArray("/DescendantFonts")!.Elements.GetDictionary(0)!)
            .Count(f => f.Elements.GetDictionary("/FontDescriptor")!.Elements.ContainsKey("/FontFile2"));
    }

    private PigDocument Export(byte[] pdf, params TextEdit[] edits) =>
        PigDocument.Open(_editor.Apply(Open(pdf), Edits(edits), TestContext.Current.CancellationToken));

    private static PdfSharp.Pdf.PdfDocument Open(byte[] pdf) => PdfReader.Open(new MemoryStream(pdf), PdfDocumentOpenMode.Modify);

    // PdfPig reports positions on the displayed page with the origin at the bottom left.
    private static (double X, double Y) Display(Page page, UglyToad.PdfPig.Core.PdfPoint point) => (point.X, page.Height - point.Y);
}
