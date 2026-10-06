using Microsoft.AspNetCore.Http.Features;
using Updf.Api.Pdf;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders().AddJsonConsole();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<PdfEditor>();
// Keep uploads in memory: by default ASP.NET buffers form files over 64 KB to disk.
builder.Services.Configure<FormOptions>(o => o.MemoryBufferThreshold = int.MaxValue);

var app = builder.Build();

app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready");
app.MapPdfEndpoints();

app.Run();
