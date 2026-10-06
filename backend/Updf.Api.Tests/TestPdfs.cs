using System.Text;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public sealed record PageSetup(double[] MediaBox, double[]? CropBox = null, int Rotate = 0);

/// <summary>Builds the PDFs and edits used by the tests.</summary>
public static class TestPdfs
{
    public static readonly PageSetup A4 = new([0, 0, 595, 842]);

    public static byte[] Blank(int pageCount) => Blank(Enumerable.Repeat(A4, pageCount).ToArray());

    public static byte[] Blank(params PageSetup[] pages)
    {
        var doc = new PdfDocument();
        foreach (var setup in pages)
        {
            var page = doc.AddPage();
            page.Elements["/MediaBox"] = Rectangle(setup.MediaBox);
            if (setup.CropBox is { } c)
            {
                page.Elements["/CropBox"] = Rectangle(c);
            }
            if (setup.Rotate != 0)
            {
                page.Elements.SetInteger("/Rotate", setup.Rotate);
            }
        }
        using var output = new MemoryStream();
        doc.Save(output);
        return output.ToArray();
    }

    private static PdfRectangle Rectangle(double[] r) => new(new XPoint(r[0], r[1]), new XPoint(r[2], r[3]));

    /// <summary>One page that inherits /Rotate 90 and its CropBox and MediaBox from the page tree.</summary>
    public static byte[] InheritedRotationAndCrop() => Raw(
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /Rotate 90 /MediaBox [100 200 700 1000] /CropBox [150 250 650 950] >>",
        "<< /Type /Page /Parent 2 0 R >>");

    private static byte[] Raw(params string[] objects)
    {
        var pdf = new StringBuilder("%PDF-1.7\n");
        var offsets = new List<int>();
        for (var i = 0; i < objects.Length; i++)
        {
            offsets.Add(pdf.Length);
            pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        var xref = pdf.Length;
        pdf.Append($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets)
        {
            pdf.Append($"{offset:D10} 00000 n \n");
        }
        pdf.Append($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }

    public static TextStyle Style(
        FontKind font = FontKind.Sans, double size = 20, bool bold = false, bool italic = false,
        bool underline = false, string color = "#000000", TextAlign align = TextAlign.Left) =>
        new(font, size, bold, italic, underline, color, align);

    public static TextEdit Edit(int page, double x, double y, string[] lines, TextStyle? style = null, Cover? cover = null) =>
        new(Guid.NewGuid(), page, x, y, lines, style ?? Style(), cover);

    public static EditDocument Edits(params TextEdit[] edits) => new(1, edits);
}
