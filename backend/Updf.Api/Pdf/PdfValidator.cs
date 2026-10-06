using Microsoft.Extensions.Options;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace Updf.Api.Pdf;

/// <summary>Checks the uploaded file and opens it for editing. Repeats the browser's upload checks on the server.</summary>
public sealed class PdfValidator(IOptions<ExportOptions> options)
{
    public PdfDocument Open(IFormFile? file)
    {
        if (file is null)
        {
            throw ExportException.NotAPdf();
        }
        if (file.Length > options.Value.MaxFileBytes)
        {
            throw ExportException.FileTooLarge();
        }

        using var stream = file.OpenReadStream();
        Span<byte> signature = stackalloc byte[5];
        if (stream.ReadAtLeast(signature, signature.Length, throwOnEndOfStream: false) < signature.Length
            || !signature.SequenceEqual("%PDF-"u8))
        {
            throw ExportException.NotAPdf();
        }
        stream.Position = 0;

        // PDFsharp needs the owner password to modify any encrypted file, so it asks even for owner-password-only
        // files. Aborting the request makes Open return null.
        var passwordRequested = false;
        PdfDocument? document;
        try
        {
            document = PdfReader.Open(stream, PdfDocumentOpenMode.Modify, args =>
            {
                passwordRequested = true;
                args.Abort = true;
            });
        }
        catch (Exception)
        {
            throw ExportException.PdfUnreadable();
        }

        if (passwordRequested || document is null || document.SecuritySettings.IsEncrypted)
        {
            document?.Dispose();
            throw ExportException.PdfEncrypted();
        }
        if (document.PageCount > options.Value.MaxPages)
        {
            document.Dispose();
            throw ExportException.PdfTooManyPages();
        }
        return document;
    }
}
