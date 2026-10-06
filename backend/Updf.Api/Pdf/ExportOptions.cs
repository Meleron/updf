using System.ComponentModel.DataAnnotations;

namespace Updf.Api.Pdf;

/// <summary>Export limits and CORS, from the "Export" config section (env vars: Export__AllowedOrigin etc.).</summary>
public sealed class ExportOptions
{
    public const string Section = "Export";

    [Range(1, long.MaxValue)]
    public long MaxFileBytes { get; set; } = 25 * 1024 * 1024;

    [Range(1, int.MaxValue)]
    public int MaxPages { get; set; } = 100;

    [Range(typeof(TimeSpan), "00:00:00.001", "00:10:00")]
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

    [Range(1, int.MaxValue)]
    public int ExportsPerMinute { get; set; } = 10;

    /// <summary>The frontend's origin, the only one CORS allows.</summary>
    [Required, Url]
    public string AllowedOrigin { get; set; } = "";

    /// <summary>Requests over this are refused before they're fully read: the file limit plus room for the edits.</summary>
    public long MaxRequestBytes => MaxFileBytes + 1024 * 1024;
}
