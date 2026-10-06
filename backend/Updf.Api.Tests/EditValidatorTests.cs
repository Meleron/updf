using Updf.Api.Pdf;
using static Updf.Api.Tests.TestPdfs;

namespace Updf.Api.Tests;

public class EditValidatorTests
{
    private const int PageCount = 3;
    private static readonly TextEdit Valid = Edit(0, 72, 96, ["Zażółć gęślą jaźń"], cover: new Cover(70, 84, 210, 16, "#FFFFFF"));

    [Fact]
    public void Valid_edits_pass()
    {
        var edits = EditValidator.Parse(ToJson(Edits(Valid)), PageCount);

        Assert.Equal(Valid.Id, Assert.Single(edits.Edits).Id);
    }

    [Fact]
    public void Edits_at_the_limits_pass()
    {
        var edits = Enumerable.Range(0, 1000).Select(i => Valid with { Id = Guid.NewGuid() }).ToList();
        edits[0] = edits[0] with { Lines = Enumerable.Repeat("a", 100).ToArray(), Page = PageCount - 1 };
        edits[1] = edits[1] with { Style = Valid.Style with { Size = 6 } };
        edits[2] = edits[2] with { Style = Valid.Style with { Size = 72 }, Cover = null };

        Assert.Equal(1000, EditValidator.Parse(ToJson(Edits([.. edits])), PageCount).Edits.Count);
    }

    public static TheoryData<string, string> InvalidEdits => new()
    {
        { "wrong version", ToJson(new EditDocument(2, [Valid])) },
        { "over 1000 edits", ToJson(Edits([.. Enumerable.Repeat(Valid, 1001)])) },
        { "over 100 lines", ToJson(Edits(Valid with { Lines = Enumerable.Repeat("a", 101).ToArray() })) },
        { "no lines", ToJson(Edits(Valid with { Lines = [] })) },
        { "negative page", ToJson(Edits(Valid with { Page = -1 })) },
        { "page out of range", ToJson(Edits(Valid with { Page = PageCount })) },
        { "empty id", ToJson(Edits(Valid with { Id = Guid.Empty })) },
        { "size below 6", ToJson(Edits(Valid with { Style = Valid.Style with { Size = 5.9 } })) },
        { "size above 72", ToJson(Edits(Valid with { Style = Valid.Style with { Size = 72.1 } })) },
        { "colour name", ToJson(Edits(Valid with { Style = Valid.Style with { Color = "red" } })) },
        { "short colour", ToJson(Edits(Valid with { Style = Valid.Style with { Color = "#FFF" } })) },
        { "non-hex colour", ToJson(Edits(Valid with { Style = Valid.Style with { Color = "#GGGGGG" } })) },
        { "zero-width cover", ToJson(Edits(Valid with { Cover = Valid.Cover! with { Width = 0 } })) },
        { "negative-height cover", ToJson(Edits(Valid with { Cover = Valid.Cover! with { Height = -1 } })) },
        { "bad cover colour", ToJson(Edits(Valid with { Cover = Valid.Cover! with { Color = "#12345" } })) },
        { "unknown font", ToJson(Edits(Valid)).Replace("\"sans\"", "\"comic\"") },
        { "numeric font", ToJson(Edits(Valid)).Replace("\"sans\"", "0") },
        { "missing style", ToJson(Edits(Valid)).Replace("\"style\":", "\"ignored\":") },
        { "null edits", """{"version":1,"edits":null}""" },
        { "empty object", "{}" },
        { "not JSON", "not json" },
        { "empty", "" },
    };

    [Theory]
    [MemberData(nameof(InvalidEdits))]
    public void Invalid_edits_are_rejected(string reason, string json)
    {
        _ = reason;
        AssertRejected("invalid-edits", () => EditValidator.Parse(json, PageCount));
    }

    [Fact]
    public void Missing_edits_are_rejected()
    {
        AssertRejected("invalid-edits", () => EditValidator.Parse(null, PageCount));
    }

    [Theory]
    [InlineData("Chinese 你好")]
    [InlineData("Emoji 😀")]
    [InlineData("Tab\there")]
    public void Characters_the_fonts_cannot_show_are_rejected(string line)
    {
        var json = ToJson(Edits(Valid, Valid with { Lines = ["fine", line] }));

        AssertRejected("unsupported-characters", () => EditValidator.Parse(json, PageCount));
    }

    private static void AssertRejected(string code, Action parse)
    {
        var error = Assert.Throws<ExportException>(parse);
        Assert.Equal((400, code), (error.StatusCode, error.Code));
    }
}
