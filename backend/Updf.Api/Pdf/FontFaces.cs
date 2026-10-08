using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Collections.Frozen;
using System.Text;

namespace Updf.Api.Pdf;

/// <summary>
/// The font faces in fonts/, copied into the build output: which face draws a family's style, the characters it can
/// show, and its metrics. Files are named after the family without spaces, then the style.
/// </summary>
public static class FontFaces
{
    private static readonly string FontsDirectory = Path.Combine(AppContext.BaseDirectory, "fonts");

    private static readonly FrozenSet<string> Names = Directory.GetFiles(FontsDirectory, "*.ttf")
        .Select(path => Path.GetFileNameWithoutExtension(path))
        .ToFrozenSet();

    private static readonly ConcurrentDictionary<string, FaceData> Data = new();

    private sealed record FaceData(FrozenSet<int> Characters, FaceMetrics Metrics);

    /// <summary>The face that draws a style, or null for an unknown family. Italic is slanted when a family has no italic faces.</summary>
    public static (string Name, bool SimulateItalic)? Find(string family, bool bold, bool italic)
    {
        var prefix = family.Replace(" ", "");
        var weight = bold ? "Bold" : "";
        string Name(string slant) => $"{prefix}-{(weight + slant is "" ? "Regular" : weight + slant)}";

        if (italic && Names.Contains(Name("Italic")))
        {
            return (Name("Italic"), false);
        }
        return Names.Contains(Name("")) ? (Name(""), italic) : null;
    }

    public static byte[] Read(string face) => File.ReadAllBytes(Path.Combine(FontsDirectory, face + ".ttf"));

    public static bool Supports(string face, Rune character) =>
        !Rune.IsControl(character) && Get(face).Characters.Contains(character.Value);

    /// <summary>A face's metrics, which the frontend reads the same way, so text boxes are laid out alike.</summary>
    public static FaceMetrics Metrics(string face) => Get(face).Metrics;

    private static FaceData Get(string face) => Data.GetOrAdd(face, name =>
    {
        var font = Read(name);
        var unitsPerEm = (double)U16(font, FindTable(font, "head") + 18);
        var hhea = FindTable(font, "hhea");
        var post = FindTable(font, "post");
        var (ascent, descent, lineGap) = (S16(font, hhea + 4), S16(font, hhea + 6), S16(font, hhea + 8));
        return new FaceData(ReadCmap(font), new FaceMetrics(
            ascent / unitsPerEm,
            (ascent - descent + lineGap) / unitsPerEm,
            -S16(font, post + 8) / unitsPerEm,
            S16(font, post + 10) / unitsPerEm));
    });

    private static FrozenSet<int> ReadCmap(byte[] font)
    {
        var characters = new HashSet<int>();
        var cmap = FindTable(font, "cmap");
        var subtableCount = U16(font, cmap + 2);

        for (var i = 0; i < subtableCount; i++)
        {
            var record = cmap + 4 + i * 8;
            var (platform, encoding) = (U16(font, record), U16(font, record + 2));
            var isUnicode = platform == 0 || (platform == 3 && encoding is 1 or 10);
            if (!isUnicode)
            {
                continue;
            }

            var subtable = cmap + (int)U32(font, record + 4);
            switch (U16(font, subtable))
            {
                case 4:
                    ReadFormat4(font, subtable, characters);
                    break;
                case 12:
                    ReadFormat12(font, subtable, characters);
                    break;
            }
        }
        return characters.ToFrozenSet();
    }

    // Segment mapping to delta values (Basic Multilingual Plane).
    private static void ReadFormat4(byte[] font, int table, HashSet<int> characters)
    {
        var segments = U16(font, table + 6) / 2;
        var ends = table + 14;
        var starts = ends + segments * 2 + 2;
        var deltas = starts + segments * 2;
        var rangeOffsets = deltas + segments * 2;

        for (var s = 0; s < segments; s++)
        {
            int start = U16(font, starts + s * 2), end = U16(font, ends + s * 2);
            int delta = U16(font, deltas + s * 2), rangeOffset = U16(font, rangeOffsets + s * 2);

            for (var c = start; c <= end && c != 0xFFFF; c++)
            {
                var glyph = rangeOffset == 0
                    ? (c + delta) & 0xFFFF
                    : U16(font, rangeOffsets + s * 2 + rangeOffset + (c - start) * 2) is var g and not 0 ? (g + delta) & 0xFFFF : 0;
                if (glyph != 0)
                {
                    characters.Add(c);
                }
            }
        }
    }

    // Segmented coverage (all of Unicode).
    private static void ReadFormat12(byte[] font, int table, HashSet<int> characters)
    {
        var groups = U32(font, table + 12);
        for (var g = 0; g < groups; g++)
        {
            var group = table + 16 + g * 12;
            for (var c = U32(font, group); c <= U32(font, group + 4); c++)
            {
                characters.Add((int)c);
            }
        }
    }

    private static int FindTable(byte[] font, string tag)
    {
        var tableCount = U16(font, 4);
        for (var i = 0; i < tableCount; i++)
        {
            var record = 12 + i * 16;
            if (Encoding.ASCII.GetString(font, record, 4) == tag)
            {
                return (int)U32(font, record + 8);
            }
        }
        throw new InvalidDataException($"The font has no '{tag}' table.");
    }

    private static ushort U16(byte[] data, int offset) => BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(offset));

    private static short S16(byte[] data, int offset) => BinaryPrimitives.ReadInt16BigEndian(data.AsSpan(offset));

    private static uint U32(byte[] data, int offset) => BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(offset));
}

/// <summary>
/// Metrics per em: the ascent and line spacing (ascent + descent + line gap) from the hhea table, and the distance from
/// the baseline down to the top of the underline and its thickness from the post table.
/// </summary>
public sealed record FaceMetrics(double Ascent, double LineHeight, double UnderlineOffset, double UnderlineThickness);
