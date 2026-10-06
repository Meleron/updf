using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Options;

namespace Updf.Api.Pdf;

public static class PdfEndpoints
{
    private const string ExportRateLimit = "export";

    public static IServiceCollection AddPdfExport(this IServiceCollection services)
    {
        services.AddOptions<ExportOptions>().BindConfiguration(ExportOptions.Section).ValidateDataAnnotations().ValidateOnStart();
        services.AddSingleton<PdfValidator>().AddSingleton<PdfEditor>().AddSingleton<PdfExporter>();

        // Refuse oversized requests before reading them, and keep uploads in memory (by default ASP.NET buffers
        // form files over 64 KB to disk).
        services.AddOptions<KestrelServerOptions>().Configure<IOptions<ExportOptions>>((kestrel, export) =>
            kestrel.Limits.MaxRequestBodySize = export.Value.MaxRequestBytes);
        services.Configure<FormOptions>(form => form.MemoryBufferThreshold = int.MaxValue);

        services.AddCors();
        services.AddOptions<CorsOptions>().Configure<IOptions<ExportOptions>>((cors, export) =>
            cors.AddDefaultPolicy(policy => policy
                .WithOrigins(export.Value.AllowedOrigin)
                .WithMethods(HttpMethods.Post)
                .WithExposedHeaders("Content-Disposition")));

        services.AddRateLimiter(limiter =>
        {
            limiter.OnRejected = async (context, _) =>
            {
                var error = ExportException.RateLimited();
                var problemDetails = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
                await ApiExceptionHandler.WriteAsync(context.HttpContext, problemDetails, error.StatusCode, error.Code);
            };
            limiter.AddPolicy(ExportRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = http.RequestServices.GetRequiredService<IOptions<ExportOptions>>().Value.ExportsPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                }));
        });
        return services;
    }

    public static void MapPdfEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/pdf/export", Export).RequireRateLimiting(ExportRateLimit);
    }

    // The form is read here rather than bound, so every failure (wrong content type, body too large) gets an error code.
    private static async Task<IResult> Export(HttpRequest request, PdfExporter exporter, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType)
        {
            throw ExportException.NotAPdf();
        }
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");

        var pdf = exporter.Export(file, form["edits"], cancellationToken);
        return Results.File(pdf, "application/pdf", $"{Path.GetFileNameWithoutExtension(file!.FileName)}-edited.pdf");
    }
}
