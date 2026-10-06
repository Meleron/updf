using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Updf.Api.Tests;

public class HealthTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task Health_endpoint_reports_healthy(string path)
    {
        var ct = TestContext.Current.CancellationToken;

        var response = await factory.CreateClient().GetAsync(path, ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(ct));
    }
}
