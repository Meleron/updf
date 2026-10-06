using System.Text.Json;
using Updf.Api.Pdf;

namespace Updf.Api.Tests;

public class EditDocumentTests
{
    [Fact]
    public void Parses_the_edit_model_from_the_spec()
    {
        const string json = """
            {
              "version": 1,
              "edits": [{
                "id": "0b8f6a52-3c1e-4c55-9d43-3f1b2b7e1a10",
                "page": 0,
                "x": 72, "y": 96,
                "lines": ["Zażółć gęślą jaźń", ""],
                "style": { "font": "serif", "size": 12.5, "bold": true, "italic": false,
                           "underline": true, "color": "#18181B", "align": "center" },
                "cover": { "x": 70, "y": 84, "width": 210, "height": 16, "color": "#FFFFFF" }
              }]
            }
            """;

        var doc = EditDocument.Parse(json);

        Assert.Equal(1, doc.Version);
        var edit = Assert.Single(doc.Edits);
        Assert.Equal(Guid.Parse("0b8f6a52-3c1e-4c55-9d43-3f1b2b7e1a10"), edit.Id);
        Assert.Equal((0, 72d, 96d), (edit.Page, edit.X, edit.Y));
        Assert.Equal(["Zażółć gęślą jaźń", ""], edit.Lines);
        Assert.Equal(new TextStyle(FontKind.Serif, 12.5, true, false, true, "#18181B", TextAlign.Center), edit.Style);
        Assert.Equal(new Cover(70, 84, 210, 16, "#FFFFFF"), edit.Cover);
    }

    [Fact]
    public void Cover_is_optional()
    {
        const string json = """
            {"version":1,"edits":[{"id":"0b8f6a52-3c1e-4c55-9d43-3f1b2b7e1a10","page":0,"x":0,"y":0,"lines":["a"],
              "style":{"font":"mono","size":12,"bold":false,"italic":false,"underline":false,"color":"#000000","align":"right"}}]}
            """;

        var edit = Assert.Single(EditDocument.Parse(json).Edits);

        Assert.Null(edit.Cover);
        Assert.Equal((FontKind.Mono, TextAlign.Right), (edit.Style.Font, edit.Style.Align));
    }

    [Fact]
    public void Missing_required_values_fail_to_parse()
    {
        Assert.ThrowsAny<JsonException>(() => EditDocument.Parse("""{"version":1}"""));
    }
}
