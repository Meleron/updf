using System.Globalization;
using System.Text;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace Updf.Api.Pdf;

/// <summary>Applies text edits to a PDF in memory with PDFsharp.</summary>
public sealed class PdfEditor
{
    private static readonly XPdfFontOptions FontOptions = new(PdfFontEncoding.Unicode);

    // PDFsharp's font resolver is global and can be set only once. A static constructor runs exactly once per process.
    static PdfEditor() => GlobalFontSettings.FontResolver = new FontResolver();

    public byte[] Apply(PdfDocument document, EditDocument edits, CancellationToken cancellationToken)
    {
        foreach (var pageEdits in edits.Edits.GroupBy(e => e.Page))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var page = document.Pages[pageEdits.Key];
            var inOriginalFonts = new List<(TextEdit Edit, OriginalFont Font, double SpaceWidth)>();
            XMatrix displayToUser;
            using (var gfx = XGraphics.FromPdfPage(page))
            {
                var displayToDrawing = DisplayToDrawing(page, gfx.PageSize.Height);
                gfx.MultiplyTransform(displayToDrawing);
                // PDFsharp's drawing space is PDF user space upside down.
                displayToUser = displayToDrawing * new XMatrix(1, 0, 0, -1, 0, gfx.PageSize.Height);

                foreach (var cover in pageEdits.Select(e => e.Cover).OfType<Cover>())
                {
                    gfx.DrawRectangle(new XSolidBrush(ToColor(cover.Color)), cover.X, cover.Y, cover.Width, cover.Height);
                }
                foreach (var edit in pageEdits)
                {
                    if (edit.PdfFont is { } pdfFont && OriginalFont.Find(page, pdfFont.Name, pdfFont.Codes) is { } font)
                    {
                        // A space the font lacks takes the space of the style's font, regular, as in the preview.
                        var space = gfx.MeasureString(" ", new XFont(edit.Style.Font, edit.Style.Size, XFontStyleEx.Regular, FontOptions)).Width;
                        inOriginalFonts.Add((edit, font, space / edit.Style.Size));
                    }
                    else
                    {
                        DrawText(gfx, edit);
                    }
                }
            }
            // After PDFsharp's content, so the covers are under this text too.
            if (inOriginalFonts.Count > 0)
            {
                WriteInOriginalFonts(page, displayToUser, inOriginalFonts);
            }
        }

        using var output = new MemoryStream();
        document.Save(output);
        return output.ToArray();
    }

    private static void DrawText(XGraphics gfx, TextEdit edit)
    {
        var style = edit.Style;
        var font = new XFont(style.Font, style.Size, FontStyle(style), FontOptions);
        var brush = new XSolidBrush(ToColor(style.Color));
        var widths = edit.Lines.Select(line => gfx.MeasureString(line, font).Width).ToList();
        var boxWidth = widths.DefaultIfEmpty(0).Max();
        var alignShare = AlignShare(style.Align);

        // The face's own ascent and line spacing, which the frontend uses too. PDFsharp's own metrics mix tables.
        var metrics = FontFaces.Metrics(FontFaces.Find(style.Font, style.Bold, style.Italic)!.Value.Name);
        var (ascent, lineHeight) = (metrics.Ascent * style.Size, metrics.LineHeight * style.Size);

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
    /// Writes text in fonts already in the PDF as content operators, laid out like <see cref="DrawText"/>: the style's
    /// face gives the ascent, line spacing and underline, and the font's own widths the line widths.
    /// </summary>
    private static void WriteInOriginalFonts(PdfPage page, XMatrix displayToUser, List<(TextEdit Edit, OriginalFont Font, double SpaceWidth)> texts)
    {
        static string N(double value) => OriginalFont.Number(value);
        var m = displayToUser;
        var content = new StringBuilder($"q {N(m.M11)} {N(m.M12)} {N(m.M21)} {N(m.M22)} {N(m.OffsetX)} {N(m.OffsetY)} cm\n");
        var resources = new Dictionary<string, string>();
        foreach (var (edit, font, space) in texts)
        {
            var (style, codes, kerning) = (edit.Style, edit.PdfFont!.Codes, edit.PdfFont.Kerning);
            var resource = resources.TryGetValue(edit.PdfFont.Name, out var added) ? added : resources[edit.PdfFont.Name] = font.AddTo(page);
            var metrics = FontFaces.Metrics(FontFaces.Find(style.Font, style.Bold, style.Italic)!.Value.Name);
            var widths = codes
                .Select((line, i) => (line.Sum(code => code < 0 ? space : font.Width(code)) - (kerning?[i].Sum() ?? 0) / 1000) * style.Size)
                .ToList();
            var boxWidth = widths.DefaultIfEmpty(0).Max();
            var color = ToColor(style.Color);

            // Text state is reset, since the page's own content may have left it changed. The text matrix turns the
            // glyphs upright in display space, whose y axis points down.
            content.Append($"{N(color.R / 255.0)} {N(color.G / 255.0)} {N(color.B / 255.0)} rg\n");
            content.Append($"BT 0 Tc 0 Tw 100 Tz 0 Ts 0 Tr {resource} {N(style.Size)} Tf\n");
            var underlines = new StringBuilder();
            for (var i = 0; i < codes.Count; i++)
            {
                if (codes[i].Count == 0)
                {
                    continue;
                }
                var x = edit.X + (boxWidth - widths[i]) * AlignShare(style.Align);
                var y = edit.Y + (metrics.Ascent + i * metrics.LineHeight) * style.Size;
                content.Append($"1 0 0 -1 {N(x)} {N(y)} Tm {font.ShowText(codes[i], kerning?[i], space)} TJ\n");
                underlines.Append($"{N(x)} {N(y + metrics.UnderlineOffset * style.Size)} {N(widths[i])} {N(metrics.UnderlineThickness * style.Size)} re f\n");
            }
            content.Append("ET\n");
            if (style.Underline)
            {
                content.Append(underlines);
            }
        }
        content.Append("Q\n");
        page.Contents.AppendContent().CreateStream(Encoding.ASCII.GetBytes(content.ToString()));
    }

    private static double AlignShare(TextAlign align) => align switch
    {
        TextAlign.Center => 0.5,
        TextAlign.Right => 1,
        _ => 0,
    };

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
