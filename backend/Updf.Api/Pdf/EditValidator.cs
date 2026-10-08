using System.Text.Json;

namespace Updf.Api.Pdf;

/// <summary>Parses the edits and checks them against the edit model's rules and limits (see specs/SPEC-1.md).</summary>
public static class EditValidator
{
    public const int MaxEdits = 1000;
    public const int MaxLines = 100;
    public const double MinSize = 6;
    public const double MaxSize = 72;

    public static EditDocument Parse(string? json, int pageCount)
    {
        EditDocument document;
        try
        {
            document = EditDocument.Parse(json ?? "");
        }
        catch (JsonException)
        {
            throw ExportException.InvalidEdits();
        }

        if (document.Version != 1 || document.Edits.Count > MaxEdits || !document.Edits.All(e => IsValid(e, pageCount)))
        {
            throw ExportException.InvalidEdits();
        }
        if (!document.Edits.All(IsSupported))
        {
            throw ExportException.UnsupportedCharacters();
        }
        return document;
    }

    private static bool IsValid(TextEdit edit, int pageCount) =>
        edit.Id != Guid.Empty
        && edit.Page >= 0 && edit.Page < pageCount
        && edit.Lines.Count is > 0 and <= MaxLines
        && FontFaces.Find(edit.Style.Font, false, false) is not null
        && edit.Style.Size is >= MinSize and <= MaxSize
        && IsColor(edit.Style.Color)
        && (edit.Cover is null || (edit.Cover.Width > 0 && edit.Cover.Height > 0 && IsColor(edit.Cover.Color)))
        && (edit.PdfFont is null || IsValid(edit.PdfFont, edit.Lines));

    // One code per character, each a space (-1) or a one- or two-byte code, and kerning after each, less than an em.
    private static bool IsValid(PdfFont font, IReadOnlyList<string> lines) =>
        font.Name.Length is > 0 and <= 127
        && font.Codes.Count == lines.Count
        && font.Codes.Zip(lines).All(pair => pair.First.Count == pair.Second.EnumerateRunes().Count() && pair.First.All(c => c is >= -1 and <= 0xFFFF))
        && (font.Kerning is null
            || (font.Kerning.Count == font.Codes.Count
                && font.Kerning.Zip(font.Codes).All(pair => pair.First.Count == pair.Second.Count && pair.First.All(k => k is >= -1000 and <= 1000))));

    private static bool IsColor(string color) => color.Length == 7 && color[0] == '#' && color[1..].All(char.IsAsciiHexDigit);

    // Text drawn in a font already in the PDF has its codes in it.
    private static bool IsSupported(TextEdit edit)
    {
        if (edit.PdfFont is not null)
        {
            return true;
        }
        var style = edit.Style;
        var (face, _) = FontFaces.Find(style.Font, style.Bold, style.Italic)!.Value;
        return edit.Lines.All(line => line.EnumerateRunes().All(c => FontFaces.Supports(face, c)));
    }
}
