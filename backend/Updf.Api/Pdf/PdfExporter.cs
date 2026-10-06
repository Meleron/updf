using Microsoft.Extensions.Options;

namespace Updf.Api.Pdf;

/// <summary>The export pipeline: check the file, then the edits, then apply them within the time limit.</summary>
public sealed class PdfExporter(PdfValidator validator, PdfEditor editor, IOptions<ExportOptions> options)
{
    public byte[] Export(IFormFile? file, string? edits, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.Value.Timeout);

        using var document = validator.Open(file);
        var editDocument = EditValidator.Parse(edits, document.PageCount);
        try
        {
            return editor.Apply(document, editDocument, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw ExportException.ProcessingTimeout();
        }
    }
}
