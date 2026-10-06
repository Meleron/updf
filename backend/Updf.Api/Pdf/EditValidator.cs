using System.Text.Json;

namespace Updf.Api.Pdf;

/// <summary>Parses the edits and checks them against the edit model's rules and limits (see specs/SPEC-1.md).</summary>
public static class EditValidator
{
    public const int MaxEdits = 1000;
    public const int MaxLines = 100;
    public const double MinSize = 6;
    public const double MaxSize = 72;

    private static readonly NotoFontResolver Fonts = new();

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
        && edit.Style.Size is >= MinSize and <= MaxSize
        && IsColor(edit.Style.Color)
        && (edit.Cover is null || (edit.Cover.Width > 0 && edit.Cover.Height > 0 && IsColor(edit.Cover.Color)));

    private static bool IsColor(string color) => color.Length == 7 && color[0] == '#' && color[1..].All(char.IsAsciiHexDigit);

    private static bool IsSupported(TextEdit edit)
    {
        var style = edit.Style;
        var face = Fonts.ResolveTypeface(FontFamilies.For(style.Font), style.Bold, style.Italic)!.FaceName;
        return edit.Lines.All(line => line.EnumerateRunes().All(c => FontCoverage.Supports(face, c)));
    }
}
