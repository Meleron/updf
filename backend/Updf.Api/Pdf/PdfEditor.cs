using System.Globalization;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace Updf.Api.Pdf;

/// <summary>Applies text edits to a PDF in memory with PDFsharp.</summary>
public sealed class PdfEditor
{
    private static readonly XPdfFontOptions FontOptions = new(PdfFontEncoding.Unicode);

    // PDFsharp's font resolver is global and can be set only once. A static constructor runs exactly once per process.
    static PdfEditor() => GlobalFontSettings.FontResolver = new NotoFontResolver();

    public byte[] Apply(PdfDocument document, EditDocument edits, CancellationToken cancellationToken)
    {
        foreach (var pageEdits in edits.Edits.GroupBy(e => e.Page))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var page = document.Pages[pageEdits.Key];
            using var gfx = XGraphics.FromPdfPage(page);
            gfx.MultiplyTransform(DisplayToDrawing(page, gfx.PageSize.Height));

            foreach (var cover in pageEdits.Select(e => e.Cover).OfType<Cover>())
            {
                gfx.DrawRectangle(new XSolidBrush(ToColor(cover.Color)), cover.X, cover.Y, cover.Width, cover.Height);
            }
            foreach (var edit in pageEdits)
            {
                DrawText(gfx, edit);
            }
        }

        using var output = new MemoryStream();
        document.Save(output);
        return output.ToArray();
    }

    private static void DrawText(XGraphics gfx, TextEdit edit)
    {
        var style = edit.Style;
        var font = new XFont(FontFamilies.For(style.Font), style.Size, FontStyle(style), FontOptions);
        var brush = new XSolidBrush(ToColor(style.Color));
        var widths = edit.Lines.Select(line => gfx.MeasureString(line, font).Width).ToList();
        var boxWidth = widths.DefaultIfEmpty(0).Max();
        var alignShare = style.Align switch
        {
            TextAlign.Center => 0.5,
            TextAlign.Right => 1,
            _ => 0,
        };

        // Line height is the font's own line spacing (ascent + descent + line gap), like CSS `line-height: normal`.
        var ascent = style.Size * font.Metrics.Ascent / font.Metrics.UnitsPerEm;
        var lineHeight = font.GetHeight();

        for (var i = 0; i < edit.Lines.Count; i++)
        {
            if (edit.Lines[i].Length == 0)
            {
                continue;
            }
            var x = edit.X + (boxWidth - widths[i]) * alignShare;
            gfx.DrawString(edit.Lines[i], font, brush, x, edit.Y + ascent + i * lineHeight);
        }
    }

    /// <summary>
    /// Maps edit coordinates (points from the top-left of the page as displayed, after cropping and /Rotate)
    /// to PDFsharp's drawing space, which maps (x, y) to PDF user space (x, pageHeight - y) and ignores
    /// both the MediaBox origin and /Rotate.
    /// </summary>
    private static XMatrix DisplayToDrawing(PdfPage page, double drawingHeight)
    {
        var media = page.MediaBox;
        var crop = page.Elements.ContainsKey("/CropBox") ? page.CropBox : media;
        var left = Math.Max(Math.Min(crop.X1, crop.X2), Math.Min(media.X1, media.X2));
        var right = Math.Min(Math.Max(crop.X1, crop.X2), Math.Max(media.X1, media.X2));
        var bottom = Math.Max(Math.Min(crop.Y1, crop.Y2), Math.Min(media.Y1, media.Y2));
        var top = Math.Min(Math.Max(crop.Y1, crop.Y2), Math.Max(media.Y1, media.Y2));

        // /Rotate turns the page clockwise for display.
        return (((page.Rotate % 360) + 360) % 360) switch
        {
            90 => new XMatrix(0, -1, 1, 0, left, drawingHeight - bottom),
            180 => new XMatrix(-1, 0, 0, -1, right, drawingHeight - bottom),
            270 => new XMatrix(0, 1, -1, 0, right, drawingHeight - top),
            _ => new XMatrix(1, 0, 0, 1, left, drawingHeight - top),
        };
    }

    private static XFontStyleEx FontStyle(TextStyle style) =>
        (style.Bold ? XFontStyleEx.Bold : XFontStyleEx.Regular)
        | (style.Italic ? XFontStyleEx.Italic : XFontStyleEx.Regular)
        | (style.Underline ? XFontStyleEx.Underline : XFontStyleEx.Regular);

    private static XColor ToColor(string hex)
    {
        var rgb = int.Parse(hex.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return XColor.FromArgb((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
    }
}
