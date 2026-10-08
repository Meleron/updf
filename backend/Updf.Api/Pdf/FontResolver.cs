using PdfSharp.Fonts;

namespace Updf.Api.Pdf;

/// <summary>Serves the faces in fonts/ to PDFsharp.</summary>
public sealed class FontResolver : IFontResolver
{
    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic) =>
        FontFaces.Find(familyName, bold, italic) is var (name, simulateItalic) ? new FontResolverInfo(name, false, simulateItalic) : null;

    public byte[]? GetFont(string faceName) => FontFaces.Read(faceName);
}
