// Generates the shared test PDFs in fixtures/pdfs. Run from anywhere: dotnet run fixtures/generate.cs
// The file over 25 MB is not stored here: each test suite generates it when it runs.
#:package PDFsharp@6.2.4

using System.Runtime.CompilerServices;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

var root = Here();
var output = Path.Combine(root, "pdfs");
Directory.CreateDirectory(output);
GlobalFontSettings.FontResolver = new NotoFonts(Path.Combine(root, "..", "fonts"));

Save("simple.pdf", Document(1, (g, _) => Lines(g, 72, 96, "Quarterly report", "This is a simple one-page document.", "It has a few lines of text to edit.")));
Save("pages-100.pdf", Document(100, (g, i) => Lines(g, 72, 96, $"Page {i + 1} of 100")));
Save("pages-101.pdf", Document(101, (g, i) => Lines(g, 72, 96, $"Page {i + 1} of 101")));
Save("polish.pdf", Document(1, (g, _) => Lines(g, 72, 96, "Zażółć gęślą jaźń", "Pchnąć w tę łódź jeża lub ośm skrzyń fig.", "ZAŻÓŁĆ GĘŚLĄ JAŹŃ")));
Save("coloured-background.pdf", Document(1, (g, _) =>
{
    g.DrawRectangle(new XSolidBrush(XColor.FromArgb(0xFE, 0xF3, 0xC7)), 0, 0, g.PageSize.Width, g.PageSize.Height);
    Lines(g, 72, 96, "Text on a coloured background", "A replacement cover should match this colour.");
}));
Save("scanned.pdf", Document(1, (g, _) =>
{
    using var image = XImage.FromStream(new MemoryStream(ScannedPage()));
    g.DrawImage(image, 0, 0, g.PageSize.Width, g.PageSize.Height);
}));

// Lines to replace: each font style the editor matches, white text on a colour, a line drawn word by word, and two
// columns on one baseline. The second page is turned by /Rotate 90, and its text is drawn turned back, so it reads upright.
var styles = Document(2, (g, i) =>
{
    if (i == 1)
    {
        g.RotateAtTransform(-90, new XPoint(100, 700));
        g.DrawString("Upright on a rotated page", new XFont(NotoFonts.Sans, 14), XBrushes.Black, 100, 700);
        return;
    }
    g.DrawString("Serif bold italic", new XFont(NotoFonts.Serif, 12, XFontStyleEx.BoldItalic), XBrushes.Black, 72, 96);
    g.DrawString("Mono regular", new XFont(NotoFonts.Mono, 10), XBrushes.Black, 72, 120);
    g.DrawString("Sans bold", new XFont(NotoFonts.Sans, 16, XFontStyleEx.Bold), XBrushes.Black, 72, 148);
    g.DrawRectangle(new XSolidBrush(XColor.FromArgb(0x1E, 0x3A, 0x8A)), 60, 162, 220, 30);
    g.DrawString("White on blue", new XFont(NotoFonts.Sans, 14), XBrushes.White, 72, 182);
    var font = new XFont(NotoFonts.Sans, 14);
    var x = 72.0;
    foreach (var word in new[] { "Drawn", "word", "by", "word" })
    {
        g.DrawString(word, font, XBrushes.Black, x, 220);
        x += g.MeasureString(word + " ", font).Width;
    }
    g.DrawString("Left column", font, XBrushes.Black, 72, 252);
    g.DrawString("Right column", font, XBrushes.Black, 340, 252);
});
styles.Pages[1].Elements.SetInteger("/Rotate", 90);
Save("styles.pdf", styles);

var rotated = Document(1, (g, _) => Lines(g, 72, 96, "This page is rotated by 90 degrees."));
rotated.Pages[0].Elements.SetInteger("/Rotate", 90);
Save("rotated.pdf", rotated);

var cropped = Document(1, (g, _) => Lines(g, 120, 160, "This page is cropped.", "Only the middle of the page is shown."));
cropped.Pages[0].Elements["/CropBox"] = new PdfRectangle(new XPoint(100, 100), new XPoint(495, 742));
Save("cropped.pdf", cropped);

// A form with one filled-in text field. Viewers draw the field from its value (NeedAppearances).
var form = Document(1, (g, _) => Lines(g, 72, 96, "Name:"));
var field = new PdfDictionary(form);
field.Elements["/Type"] = new PdfName("/Annot");
field.Elements["/Subtype"] = new PdfName("/Widget");
field.Elements["/FT"] = new PdfName("/Tx");
field.Elements["/T"] = new PdfString("name");
field.Elements["/V"] = new PdfString("Jan Kowalski");
field.Elements["/DA"] = new PdfString("/Helv 12 Tf 0 g");
field.Elements["/F"] = new PdfInteger(4);
field.Elements["/Rect"] = new PdfRectangle(new XPoint(120, 730), new XPoint(320, 752));
field.Elements["/P"] = form.Pages[0].Reference;
form.Internals.AddObject(field);
form.Pages[0].Elements["/Annots"] = new PdfArray(form, field.Reference!);
var helvetica = new PdfDictionary(form);
helvetica.Elements["/Type"] = new PdfName("/Font");
helvetica.Elements["/Subtype"] = new PdfName("/Type1");
helvetica.Elements["/BaseFont"] = new PdfName("/Helvetica");
var resources = new PdfDictionary(form);
resources.Elements["/Font"] = new PdfDictionary(form) { Elements = { ["/Helv"] = helvetica } };
var acroForm = new PdfDictionary(form);
acroForm.Elements["/Fields"] = new PdfArray(form, field.Reference!);
acroForm.Elements["/NeedAppearances"] = new PdfBoolean(true);
acroForm.Elements["/DR"] = resources;
acroForm.Elements["/DA"] = new PdfString("/Helv 12 Tf 0 g");
form.Internals.Catalog.Elements["/AcroForm"] = acroForm;
Save("form.pdf", form);

var password = Document(1, (g, _) => Lines(g, 72, 96, "This document needs a password to open."));
password.SecuritySettings.UserPassword = "user";
password.SecuritySettings.OwnerPassword = "owner";
Save("password.pdf", password);

// Opens without a password, but the owner password restricts what may be done with it.
var ownerPassword = Document(1, (g, _) => Lines(g, 72, 96, "This document has only an owner password."));
ownerPassword.SecuritySettings.OwnerPassword = "owner";
ownerPassword.SecuritySettings.PermitModifyDocument = false;
Save("owner-password.pdf", ownerPassword);

// A download cut off halfway.
var simple = File.ReadAllBytes(Path.Combine(output, "simple.pdf"));
File.WriteAllBytes(Path.Combine(output, "damaged.pdf"), simple[..(simple.Length / 2)]);
File.WriteAllText(Path.Combine(output, "not-a-pdf.pdf"), "This is a plain text file with a .pdf extension.\n");

void Save(string name, PdfDocument document)
{
    document.Save(Path.Combine(output, name));
    Console.WriteLine(name);
}

static PdfDocument Document(int pageCount, Action<XGraphics, int> draw)
{
    var document = new PdfDocument();
    document.Info.Title = "updf test document";
    for (var i = 0; i < pageCount; i++)
    {
        var page = document.AddPage();
        page.Width = XUnit.FromPoint(595);
        page.Height = XUnit.FromPoint(842);
        using var g = XGraphics.FromPdfPage(page);
        draw(g, i);
    }
    return document;
}

static void Lines(XGraphics g, double x, double y, params string[] lines)
{
    var font = new XFont(NotoFonts.Sans, 14);
    foreach (var line in lines)
    {
        g.DrawString(line, font, XBrushes.Black, x, y);
        y += 22;
    }
}

// An image-only page: grey bars where a scanner would have captured lines of text. 24-bit BMP, rows bottom-up.
static byte[] ScannedPage()
{
    const int width = 595, height = 842, stride = (width * 3 + 3) / 4 * 4; // rows are padded to a multiple of 4 bytes
    var pixels = new byte[stride * height];
    for (var row = 0; row < height; row++)
    {
        var top = height - 1 - row;
        var line = (top - 80) / 24;
        var ink = top >= 80 && top < 560 && (top - 80) % 24 < 10 && line % 5 != 4;
        var right = 523 - line * 37 % 180;
        for (var x = 0; x < width; x++)
        {
            var value = (byte)(ink && x >= 72 && x < right ? 60 : 245);
            pixels.AsSpan(row * stride + x * 3, 3).Fill(value);
        }
    }
    var bmp = new byte[54 + pixels.Length];
    var w = new BinaryWriter(new MemoryStream(bmp));
    w.Write("BM"u8); w.Write(bmp.Length); w.Write(0); w.Write(54);
    w.Write(40); w.Write(width); w.Write(height); w.Write((short)1); w.Write((short)24); w.Write(0); w.Write(pixels.Length);
    w.Write(2835); w.Write(2835); w.Write(0); w.Write(0);
    w.Write(pixels);
    return bmp;
}

static string Here([CallerFilePath] string path = "") => Path.GetDirectoryName(path)!;

sealed class NotoFonts(string fonts) : IFontResolver
{
    public const string Sans = "Noto Sans";
    public const string Serif = "Noto Serif";
    public const string Mono = "Noto Sans Mono";

    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic)
    {
        var prefix = familyName.Replace(" ", "");
        var style = (bold, italic) switch
        {
            (true, true) => "BoldItalic",
            (true, false) => "Bold",
            (false, true) => "Italic",
            _ => "Regular",
        };
        return new FontResolverInfo($"{prefix}-{style}");
    }

    public byte[] GetFont(string faceName) => File.ReadAllBytes(Path.Combine(fonts, faceName + ".ttf"));
}
