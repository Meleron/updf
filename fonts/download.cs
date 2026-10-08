// Downloads the open font families that replacements fall back on, from Google Fonts, into this folder with their
// licences. Run from anywhere: dotnet run fonts/download.cs
// Each family needs regular, bold, italic and bold italic faces. Files are named <family without spaces>-<style>.ttf.
// The Noto files are kept as they are.

using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;

string[] families =
[
    // Metric-compatible with common proprietary fonts: Arial and Helvetica, Times, Courier, Calibri, Cambria, Georgia.
    "Arimo", "Tinos", "Cousine", "Carlito", "Caladea", "Gelasio",
    // Popular open families, matched by their own names.
    "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans 3", "Source Serif 4", "Raleway",
    "Nunito", "Playfair Display", "PT Sans", "PT Serif", "Roboto Mono", "Work Sans", "Fira Sans",
    "IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono", "Lora", "EB Garamond", "Ubuntu",
];
string[] styles = ["Regular", "Bold", "Italic", "BoldItalic"];

var root = Here();
Directory.CreateDirectory(Path.Combine(root, "licenses"));
using var http = new HttpClient();

foreach (var family in families)
{
    var prefix = family.Replace(" ", "");
    // The response starts with a line that stops it being run as script.
    var body = await http.GetStringAsync($"https://fonts.google.com/download/list?family={Uri.EscapeDataString(family)}");
    var manifest = JsonDocument.Parse(body[body.IndexOf('{')..]).RootElement.GetProperty("manifest");

    var licence = manifest.GetProperty("files").EnumerateArray().First(f => f.GetProperty("filename").GetString() is "OFL.txt" or "LICENSE.txt" or "UFL.txt");
    await File.WriteAllTextAsync(Path.Combine(root, "licenses", $"{prefix}.txt"), licence.GetProperty("contents").GetString());

    // Static faces are in static/ for variable families, and at the top for the others.
    var files = manifest.GetProperty("fileRefs").EnumerateArray()
        .Select(f => (Name: f.GetProperty("filename").GetString()!, Url: f.GetProperty("url").GetString()!))
        .ToList();
    foreach (var style in styles)
    {
        var face = files.FirstOrDefault(f => Regex.IsMatch(f.Name, $@"^(static/)?{prefix}-{style}\.ttf$"));
        if (face.Url is null)
        {
            throw new InvalidOperationException($"{family} has no {style} face.");
        }
        await File.WriteAllBytesAsync(Path.Combine(root, $"{prefix}-{style}.ttf"), await http.GetByteArrayAsync(face.Url));
    }
    Console.WriteLine(family);
}

static string Here([CallerFilePath] string path = "") => Path.GetDirectoryName(path)!;
