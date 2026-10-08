using System.Text.Json;
using System.Text.Json.Serialization;

namespace Updf.Api.Pdf;

/// <summary>The edit model shared by the frontend, the backend and autosave (see specs/SPEC-1.md).</summary>
public sealed record EditDocument(int Version, IReadOnlyList<TextEdit> Edits)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) },
    };

    public static EditDocument Parse(string json) =>
        JsonSerializer.Deserialize<EditDocument>(json, JsonOptions) ?? throw new JsonException("The edits are null.");
}

public sealed record TextEdit(
    Guid Id, int Page, double X, double Y, IReadOnlyList<string> Lines, TextStyle Style, Cover? Cover = null, PdfFont? PdfFont = null);

public sealed record TextStyle(string Font, double Size, bool Bold, bool Italic, bool Underline, string Color, TextAlign Align);

public sealed record Cover(double X, double Y, double Width, double Height, string Color);

/// <summary>
/// A font already in the PDF to draw a replacement in, by its name, with each line's character codes in it. -1 is a
/// space the font lacks, which takes the space of the style's font.
/// </summary>
public sealed record PdfFont(string Name, IReadOnlyList<IReadOnlyList<int>> Codes);

public enum TextAlign { Left, Center, Right }
