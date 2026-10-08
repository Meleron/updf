namespace Updf.Api.Tests;

public class FontsTests
{
    [Fact]
    public void Fonts_and_their_licences_are_copied_to_the_build_output()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "fonts");
        var families = Directory.GetFiles(dir, "*-Regular.ttf").Select(path => Path.GetFileName(path).Replace("-Regular.ttf", "")).ToList();

        Assert.Contains("NotoSans", families);
        Assert.Contains("Arimo", families);
        Assert.True(File.Exists(Path.Combine(dir, "OFL.txt")));
        Assert.All(families.Where(f => !f.StartsWith("Noto")), f => Assert.True(File.Exists(Path.Combine(dir, "licenses", f + ".txt")), f));
    }
}
