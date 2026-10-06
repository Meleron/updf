using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public class NotoFontResolverTests
{
    private readonly NotoFontResolver _resolver = new();

    [Theory]
    [InlineData("Noto Sans", false, false, "NotoSans-Regular")]
    [InlineData("Noto Sans", true, false, "NotoSans-Bold")]
    [InlineData("Noto Sans", false, true, "NotoSans-Italic")]
    [InlineData("Noto Sans", true, true, "NotoSans-BoldItalic")]
    [InlineData("Noto Serif", false, false, "NotoSerif-Regular")]
    [InlineData("Noto Serif", true, true, "NotoSerif-BoldItalic")]
    [InlineData("Noto Sans Mono", false, false, "NotoSansMono-Regular")]
    [InlineData("Noto Sans Mono", true, false, "NotoSansMono-Bold")]
    public void Resolves_each_style_to_its_own_face(string family, bool bold, bool italic, string face)
    {
        var info = _resolver.ResolveTypeface(family, bold, italic);

        Assert.NotNull(info);
        Assert.Equal(face, info.FaceName);
        Assert.False(info.MustSimulateBold);
        Assert.False(info.MustSimulateItalic);
    }

    [Theory]
    [InlineData(false, "NotoSansMono-Regular")]
    [InlineData(true, "NotoSansMono-Bold")]
    public void Simulates_mono_italic_because_there_is_no_italic_face(bool bold, string face)
    {
        var info = _resolver.ResolveTypeface("Noto Sans Mono", bold, italic: true);

        Assert.NotNull(info);
        Assert.Equal(face, info.FaceName);
        Assert.True(info.MustSimulateItalic);
    }

    [Fact]
    public void Returns_null_for_unknown_families()
    {
        Assert.Null(_resolver.ResolveTypeface("Arial", false, false));
    }

    [Fact]
    public void Serves_the_font_file_for_a_face()
    {
        var bytes = _resolver.GetFont("NotoSerif-Bold");

        Assert.NotNull(bytes);
        Assert.Equal([0x00, 0x01, 0x00, 0x00], bytes[..4]); // TrueType signature
    }
}
