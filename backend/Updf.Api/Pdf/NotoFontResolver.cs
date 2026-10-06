using PdfSharp.Fonts;

namespace Updf.Api.Pdf;

/// <summary>Serves the Noto fonts copied from the repo's fonts/ folder into the build output.</summary>
public sealed class NotoFontResolver : IFontResolver
{
    private static readonly string FontsDirectory = Path.Combine(AppContext.BaseDirectory, "fonts");

    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic)
    {
        var prefix = familyName switch
        {
            FontFamilies.Sans => "NotoSans",
            FontFamilies.Serif => "NotoSerif",
            FontFamilies.Mono => "NotoSansMono",
            _ => null,
        };
        if (prefix is null)
        {
            return null;
        }

        // Noto Sans Mono has no italic faces, so italic is simulated by slanting.
        if (prefix == "NotoSansMono")
        {
            return new FontResolverInfo($"{prefix}-{(bold ? "Bold" : "Regular")}", false, italic);
        }

        var style = (bold, italic) switch
        {
            (true, true) => "BoldItalic",
            (true, false) => "Bold",
            (false, true) => "Italic",
            _ => "Regular",
        };
        return new FontResolverInfo($"{prefix}-{style}");
    }

    public byte[]? GetFont(string faceName) => File.ReadAllBytes(Path.Combine(FontsDirectory, faceName + ".ttf"));
}

public static class FontFamilies
{
    public const string Sans = "Noto Sans";
    public const string Serif = "Noto Serif";
    public const string Mono = "Noto Sans Mono";

    public static string For(FontKind font) => font switch
    {
        FontKind.Serif => Serif,
        FontKind.Mono => Mono,
        _ => Sans,
    };
}
