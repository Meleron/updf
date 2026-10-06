using System.Text;
using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public class FontCoverageTests
{
    public static TheoryData<string> Faces => new(Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "fonts"), "*.ttf")
        .Select(Path.GetFileNameWithoutExtension)!);

    [Theory]
    [MemberData(nameof(Faces))]
    public void Every_face_supports_polish_cyrillic_and_greek(string face)
    {
        const string text = "Zażółć gęślą jaźń ZAŻÓŁĆ GĘŚLĄ JAŹŃ Съешь же ещё этих булок Ξεσκεπάζω την ψυχοφθόρα 0123 €.,;!?";

        Assert.All(text.EnumerateRunes(), r => Assert.True(FontCoverage.Supports(face, r), $"U+{r.Value:X4}"));
    }

    [Theory]
    [InlineData("你")]
    [InlineData("😀")]
    [InlineData("\t")]
    [InlineData("\n")]
    [InlineData("\u0000")]
    public void Characters_outside_the_fonts_are_unsupported(string character)
    {
        Assert.False(FontCoverage.Supports("NotoSans-Regular", Rune.GetRuneAt(character, 0)));
    }
}
