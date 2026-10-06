using Microsoft.AspNetCore.Diagnostics;
using Updf.Api.Pdf;

namespace Updf.Api;

/// <summary>Turns errors into ProblemDetails with a stable `code` the frontend translates. Never sends exception text.</summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var error = exception switch
        {
            ExportException e => e,
            BadHttpRequestException { StatusCode: StatusCodes.Status413PayloadTooLarge } => ExportException.FileTooLarge(),
            // The form couldn't be read, so there is no file.
            BadHttpRequestException or InvalidDataException => ExportException.NotAPdf(),
            _ => null,
        };
        if (error is null)
        {
            logger.LogError(exception, "Unexpected error.");
        }
        return await WriteAsync(context, problemDetails, error?.StatusCode ?? StatusCodes.Status500InternalServerError, error?.Code ?? "unexpected");
    }

    public static ValueTask<bool> WriteAsync(HttpContext context, IProblemDetailsService problemDetails, int status, string code)
    {
        context.Response.StatusCode = status;
        return problemDetails.TryWriteAsync(new()
        {
            HttpContext = context,
            ProblemDetails = { Status = status, Extensions = { ["code"] = code } },
        });
    }
}
