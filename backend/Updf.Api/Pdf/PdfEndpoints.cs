using Microsoft.AspNetCore.Mvc;

namespace Updf.Api.Pdf;

public static class PdfEndpoints
{
    public static void MapPdfEndpoints(this IEndpointRouteBuilder app)
    {
        // A stateless API with no cookies, so there is nothing for antiforgery to protect.
        app.MapPost("/api/pdf/export", Export).DisableAntiforgery();
    }

    private static IResult Export(IFormFile file, [FromForm] string edits, PdfEditor editor, CancellationToken cancellationToken)
    {
        using var pdf = file.OpenReadStream();
        var output = editor.Apply(pdf, EditDocument.Parse(edits), cancellationToken);
        return Results.File(output, "application/pdf", $"{Path.GetFileNameWithoutExtension(file.FileName)}-edited.pdf");
    }
}
