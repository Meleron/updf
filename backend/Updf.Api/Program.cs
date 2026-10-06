using Updf.Api;
using Updf.Api.Pdf;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders().AddJsonConsole(o => o.IncludeScopes = true);
builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = c =>
    c.ProblemDetails.Extensions["requestId"] = c.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddPdfExport();

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();
app.UseRateLimiter();

app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready");
app.MapPdfEndpoints();

app.Run();
