using System.Text;
using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public class FontFacesTests
{
    private static readonly string FontsDirectory = Path.Combine(AppContext.BaseDirectory, "fonts");

    public static TheoryData<string> NotoFaces => new(Directory.GetFiles(FontsDirectory, "Noto*.ttf").Select(Path.GetFileNameWithoutExtension)!);

    public static TheoryData<string> Families => new(Directory.GetFiles(FontsDirectory, "*-Regular.ttf")
        .Select(path => Path.GetFileNameWithoutExtension(path)!.Replace("-Regular", "")));

    [Theory]
    [MemberData(nameof(NotoFaces))]
    public void Every_noto_face_supports_polish_cyrillic_and_greek(string face)
    {
        const string text = "Zażółć gęślą jaźń ZAŻÓŁĆ GĘŚLĄ JAŹŃ Съешь же ещё этих булок Ξεσκεπάζω την ψυχοφθόρα 0123 €.,;!?";

        Assert.All(text.EnumerateRunes(), r => Assert.True(FontFaces.Supports(face, r), $"U+{r.Value:X4}"));
    }

    [Theory]
    [MemberData(nameof(Families))]
    public void Every_other_family_has_four_faces_with_latin_and_polish(string prefix)
    {
        if (prefix == "NotoSansMono")
        {
            return;
        }
        foreach (var style in new[] { "Regular", "Bold", "Italic", "BoldItalic" })
        {
            var face = $"{prefix}-{style}";
            Assert.True(File.Exists(Path.Combine(FontsDirectory, face + ".ttf")), face);
            Assert.All("Zażółć gęślą jaźń 0123.,;!?".EnumerateRunes(), r => Assert.True(FontFaces.Supports(face, r), $"{face} U+{r.Value:X4}"));
        }
    }

    [Theory]
    [InlineData("你")]
    [InlineData("😀")]
    [InlineData("\t")]
    [InlineData("\n")]
    [InlineData("\u0000")]
    public void Characters_outside_the_fonts_are_unsupported(string character)
    {
        Assert.False(FontFaces.Supports("NotoSans-Regular", Rune.GetRuneAt(character, 0)));
    }

    [Theory]
    [InlineData("NotoSans-Regular", 1.069, 1.362, 0.1, 0.05)]
    [InlineData("Arimo-Regular", 1854 / 2048.0, (1854 + 434 + 67) / 2048.0, 217 / 2048.0, 150 / 2048.0)]
    public void Metrics_come_from_the_hhea_and_post_tables(string face, double ascent, double lineHeight, double underlineOffset, double underlineThickness)
    {
        Assert.Equal(new FaceMetrics(ascent, lineHeight, underlineOffset, underlineThickness), FontFaces.Metrics(face));
    }
}
