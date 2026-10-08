using System.Globalization;
using System.Text;
using PdfSharp.Pdf;
using PdfSharp.Pdf.Advanced;

namespace Updf.Api.Pdf;

/// <summary>A font already in the PDF that text can be written in: its dictionary, its code size and its glyph widths.</summary>
public sealed class OriginalFont
{
    private readonly PdfDictionary _font;
    private readonly int _codeBytes;
    private readonly Func<int, double> _width;

    private OriginalFont(PdfDictionary font, int codeBytes, Func<int, double> width) =>
        (_font, _codeBytes, _width) = (font, codeBytes, width);

    /// <summary>
    /// The font a page draws text in under this name (its BaseFont or FontName, as pdf.js reports it), searching the
    /// page's resources and the forms it draws. Null when there's none, or it's a font text can't be written in here:
    /// Type3, or composite without the Identity-H encoding.
    /// </summary>
    public static OriginalFont? Find(PdfPage page, string name, IReadOnlyList<IReadOnlyList<int>> codes)
    {
        var font = Find(page.Resources, name, []);
        if (font is null)
        {
            return null;
        }
        var subtype = font.Elements.GetName("/Subtype");
        if (subtype == "/Type0" && font.Elements.GetName("/Encoding") == "/Identity-H")
        {
            var cidFont = font.Elements.GetArray("/DescendantFonts")?.Elements.GetDictionary(0);
            return cidFont is null ? null : new OriginalFont(font, 2, CidWidths(cidFont));
        }
        if (subtype is "/Type0" or "/Type3" || codes.Any(line => line.Any(code => code > 0xFF)))
        {
            return null;
        }
        return new OriginalFont(font, 1, SimpleWidths(font));
    }

    /// <summary>A code's width per em.</summary>
    public double Width(int code) => _width(code);

    /// <summary>Puts the font in the page's font resources under a new name, which it returns.</summary>
    public string AddTo(PdfPage page)
    {
        var fonts = page.Resources.Elements.GetDictionary("/Font");
        if (fonts is null)
        {
            fonts = new PdfDictionary(page.Owner);
            page.Resources.Elements["/Font"] = fonts;
        }
        var key = Enumerable.Range(1, int.MaxValue).Select(n => $"/UpdfF{n}").First(k => !fonts.Elements.ContainsKey(k));
        fonts.Elements[key] = _font.Reference is { } reference ? reference : _font.Clone();
        return key;
    }

    /// <summary>A TJ operand for a line: its codes as hex strings, with each space the font lacks as a move of the given width.</summary>
    public string ShowText(IReadOnlyList<int> codes, IReadOnlyList<double>? kerning, double spaceWidth)
    {
        var text = new StringBuilder("[");
        var open = false;
        for (var i = 0; i < codes.Count; i++)
        {
            // A space the font lacks moves the text instead, and kerning moves the next character back.
            var adjustment = (codes[i] < 0 ? -spaceWidth * 1000 : 0) + (kerning?[i] ?? 0);
            if (codes[i] >= 0)
            {
                text.Append(open ? "" : "<").Append(codes[i].ToString(_codeBytes == 2 ? "X4" : "X2", CultureInfo.InvariantCulture));
                open = true;
            }
            if (adjustment != 0)
            {
                text.Append(open ? "> " : "").Append(Number(adjustment)).Append(' ');
                open = false;
            }
        }
        return text.Append(open ? ">]" : "]").ToString();
    }

    public static string Number(double value) => value.ToString("0.####", CultureInfo.InvariantCulture);

    // Forms are searched once each, so cyclic resources end.
    private static PdfDictionary? Find(PdfDictionary? resources, string name, HashSet<PdfDictionary> seen)
    {
        if (resources is null || !seen.Add(resources))
        {
            return null;
        }
        var fonts = resources.Elements.GetDictionary("/Font");
        foreach (var key in fonts?.Elements.Keys ?? [])
        {
            if (fonts!.Elements.GetDictionary(key) is { } font && Names(font).Contains(name))
            {
                return font;
            }
        }
        var forms = resources.Elements.GetDictionary("/XObject");
        foreach (var key in forms?.Elements.Keys ?? [])
        {
            if (forms!.Elements.GetDictionary(key) is { } form && Find(form.Elements.GetDictionary("/Resources"), name, seen) is { } found)
            {
                return found;
            }
        }
        return null;
    }

    // The names pdf.js may report: the BaseFont, or the FontName of the font's descriptor, also of a composite font's
    // descendant.
    private static IEnumerable<string> Names(PdfDictionary font)
    {
        var cidFont = font.Elements.GetArray("/DescendantFonts")?.Elements.GetDictionary(0);
        foreach (var dictionary in new[] { font, cidFont })
        {
            yield return Decode(dictionary?.Elements.GetName("/BaseFont"));
            yield return Decode(dictionary?.Elements.GetDictionary("/FontDescriptor")?.Elements.GetName("/FontName"));
        }
    }

    // A name without its slash and with #xx escapes decoded.
    private static string Decode(string? name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return "";
        }
        var bytes = new List<byte>();
        for (var i = 1; i < name.Length; i++)
        {
            if (name[i] == '#' && i + 2 < name.Length && byte.TryParse(name.AsSpan(i + 1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var b))
            {
                bytes.Add(b);
                i += 2;
            }
            else
            {
                bytes.AddRange(Encoding.UTF8.GetBytes(name[i].ToString()));
            }
        }
        return Encoding.UTF8.GetString(bytes.ToArray());
    }

    // Widths in thousandths of an em from FirstChar on, else the descriptor's MissingWidth.
    private static Func<int, double> SimpleWidths(PdfDictionary font)
    {
        var first = font.Elements.GetInteger("/FirstChar");
        var widths = font.Elements.GetArray("/Widths");
        var missing = font.Elements.GetDictionary("/FontDescriptor")?.Elements.GetReal("/MissingWidth") ?? 0;
        return code => (widths is not null && code >= first && code - first < widths.Elements.Count ? widths.Elements.GetReal(code - first) : missing) / 1000;
    }

    // A CIDFont's W array lists widths as "first [w1 w2 ...]" or "first last w", and DW is the default.
    private static Func<int, double> CidWidths(PdfDictionary cidFont)
    {
        var widths = new Dictionary<int, double>();
        var w = cidFont.Elements.GetArray("/W");
        for (var i = 0; w is not null && i + 1 < w.Elements.Count;)
        {
            var first = w.Elements.GetInteger(i);
            if (w.Elements.GetArray(i + 1) is { } list)
            {
                for (var j = 0; j < list.Elements.Count; j++)
                {
                    widths[first + j] = list.Elements.GetReal(j);
                }
                i += 2;
            }
            else if (i + 2 < w.Elements.Count)
            {
                var last = w.Elements.GetInteger(i + 1);
                for (var c = first; c <= last && c - first < 0x10000; c++)
                {
                    widths[c] = w.Elements.GetReal(i + 2);
                }
                i += 3;
            }
            else
            {
                break;
            }
        }
        var defaultWidth = cidFont.Elements.ContainsKey("/DW") ? cidFont.Elements.GetReal("/DW") : 1000;
        return code => widths.GetValueOrDefault(code, defaultWidth) / 1000;
    }
}
