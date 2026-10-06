namespace Updf.Api.Tests;

public class FontsTests
{
    [Fact]
    public void Noto_fonts_and_licence_are_copied_to_the_build_output()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "fonts");

        Assert.Equal(10, Directory.GetFiles(dir, "*.ttf").Length);
        Assert.True(File.Exists(Path.Combine(dir, "OFL.txt")));
    }
}
