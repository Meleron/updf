using System.Buffers.Binary;
using System.Collections.Frozen;
using System.Text;

namespace Updf.Api.Pdf;

/// <summary>The characters each Noto face can show, read from the fonts' Unicode cmap tables.</summary>
public static class FontCoverage
{
    private static readonly FrozenDictionary<string, FrozenSet<int>> Faces = Directory
        .GetFiles(Path.Combine(AppContext.BaseDirectory, "fonts"), "*.ttf")
        .ToFrozenDictionary(path => Path.GetFileNameWithoutExtension(path), path => ReadCmap(File.ReadAllBytes(path)));

    public static bool Supports(string faceName, Rune character) =>
        !Rune.IsControl(character) && Faces[faceName].Contains(character.Value);

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

    private static uint U32(byte[] data, int offset) => BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(offset));
}
