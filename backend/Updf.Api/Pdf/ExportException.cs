namespace Updf.Api.Pdf;

/// <summary>An export that can't be done, with its HTTP status and the stable error code from the spec.</summary>
public sealed class ExportException(int statusCode, string code) : Exception(code)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;

    public static ExportException InvalidEdits() => new(StatusCodes.Status400BadRequest, "invalid-edits");
    public static ExportException UnsupportedCharacters() => new(StatusCodes.Status400BadRequest, "unsupported-characters");
    public static ExportException FileTooLarge() => new(StatusCodes.Status413PayloadTooLarge, "file-too-large");
    public static ExportException NotAPdf() => new(StatusCodes.Status415UnsupportedMediaType, "not-a-pdf");
    public static ExportException PdfEncrypted() => new(StatusCodes.Status422UnprocessableEntity, "pdf-encrypted");
    public static ExportException PdfTooManyPages() => new(StatusCodes.Status422UnprocessableEntity, "pdf-too-many-pages");
    public static ExportException PdfUnreadable() => new(StatusCodes.Status422UnprocessableEntity, "pdf-unreadable");
    public static ExportException RateLimited() => new(StatusCodes.Status429TooManyRequests, "rate-limited");
    public static ExportException ProcessingTimeout() => new(StatusCodes.Status503ServiceUnavailable, "processing-timeout");
}
