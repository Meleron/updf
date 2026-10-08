using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public class FontResolverTests
{
    private readonly FontResolver _resolver = new();

    [Theory]
    [InlineData("Noto Sans", false, false, "NotoSans-Regular")]
    [InlineData("Noto Sans", true, false, "NotoSans-Bold")]
    [InlineData("Noto Sans", false, true, "NotoSans-Italic")]
    [InlineData("Noto Sans", true, true, "NotoSans-BoldItalic")]
    [InlineData("Noto Sans Mono", true, false, "NotoSansMono-Bold")]
    [InlineData("Tinos", false, true, "Tinos-Italic")]
    [InlineData("IBM Plex Sans", true, true, "IBMPlexSans-BoldItalic")]
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
    public void Simulates_italic_for_a_family_without_italic_faces(bool bold, string face)
    {
        var info = _resolver.ResolveTypeface("Noto Sans Mono", bold, italic: true);

        Assert.NotNull(info);
        Assert.Equal(face, info.FaceName);
        Assert.True(info.MustSimulateItalic);
    }

    [Theory]
    [InlineData("Arial")]
    [InlineData("../fonts/NotoSans")]
    public void Returns_null_for_unknown_families(string family)
    {
        Assert.Null(_resolver.ResolveTypeface(family, false, false));
    }

    [Fact]
    public void Serves_the_font_file_for_a_face()
    {
        var bytes = _resolver.GetFont("NotoSerif-Bold");

        Assert.NotNull(bytes);
        Assert.Equal([0x00, 0x01, 0x00, 0x00], bytes[..4]); // TrueType signature
    }
}
