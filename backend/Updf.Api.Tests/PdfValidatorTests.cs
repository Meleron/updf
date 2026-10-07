using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Updf.Api.Pdf;
using static Updf.Api.Tests.TestPdfs;

namespace Updf.Api.Tests;

public class PdfValidatorTests
{
    private static PdfValidator Validator(long maxFileBytes = 25 * 1024 * 1024) =>
        new(Options.Create(new ExportOptions { MaxFileBytes = maxFileBytes, AllowedOrigin = "http://localhost:3000" }));

    [Fact]
    public void A_valid_pdf_is_opened_for_editing()
    {
        using var document = Validator().Open(File(Blank(3)));

        Assert.Equal(3, document.PageCount);
    }

    [Fact]
    public void A_pdf_with_100_pages_passes()
    {
        using var document = Validator().Open(File(Blank(100)));

        Assert.Equal(100, document.PageCount);
    }

    [Fact]
    public void A_file_at_the_size_limit_passes()
    {
        var pdf = Blank(1);

        using var document = Validator(maxFileBytes: pdf.Length).Open(File(pdf));

        Assert.Equal(1, document.PageCount);
    }

    [Fact]
    public void A_file_over_the_size_limit_is_rejected()
    {
        var pdf = Blank(1);

        AssertRejected(413, "file-too-large", () => Validator(maxFileBytes: pdf.Length - 1).Open(File(pdf)));
    }

    [Fact]
    public void A_missing_file_is_rejected() => AssertRejected(415, "not-a-pdf", () => Validator().Open(null));

    public static TheoryData<string, byte[]> NotPdfs => new()
    {
        { "empty", [] },
        { "text", Text() },
        { "signature not at the start", [(byte)' ', .. Blank(1)] },
        { "only part of the signature", "%PDF"u8.ToArray() },
    };

    [Theory]
    [MemberData(nameof(NotPdfs))]
    public void A_file_without_the_pdf_signature_is_rejected(string reason, byte[] file)
    {
        _ = reason;
        AssertRejected(415, "not-a-pdf", () => Validator().Open(File(file)));
    }

    [Theory]
    [InlineData("user", "owner")]
    [InlineData(null, "owner")]
    public void An_encrypted_pdf_is_rejected(string? userPassword, string ownerPassword)
    {
        AssertRejected(422, "pdf-encrypted", () => Validator().Open(File(Encrypted(userPassword, ownerPassword))));
    }

    [Fact]
    public void A_pdf_with_over_100_pages_is_rejected() =>
        AssertRejected(422, "pdf-too-many-pages", () => Validator().Open(File(Blank(101))));

    public static TheoryData<string, byte[]> DamagedPdfs => new()
    {
        { "truncated", Truncated() },
        { "garbage after the signature", Garbage() },
    };

    [Theory]
    [MemberData(nameof(DamagedPdfs))]
    public void A_damaged_pdf_is_rejected(string reason, byte[] file)
    {
        _ = reason;
        AssertRejected(422, "pdf-unreadable", () => Validator().Open(File(file)));
    }

    // The shared fixtures in fixtures/pdfs. The browser's upload check must reach the same result for each.
    [Theory]
    [InlineData("simple.pdf")]
    [InlineData("pages-100.pdf")]
    [InlineData("polish.pdf")]
    [InlineData("coloured-background.pdf")]
    [InlineData("scanned.pdf")]
    [InlineData("rotated.pdf")]
    [InlineData("cropped.pdf")]
    [InlineData("form.pdf")]
    public void Valid_fixtures_are_opened(string name)
    {
        using var document = Validator().Open(Fixture(name));
    }

    [Theory]
    [InlineData("not-a-pdf.pdf", "not-a-pdf")]
    [InlineData("pages-101.pdf", "pdf-too-many-pages")]
    [InlineData("password.pdf", "pdf-encrypted")]
    [InlineData("owner-password.pdf", "pdf-encrypted")]
    [InlineData("damaged.pdf", "pdf-unreadable")]
    public void Invalid_fixtures_are_rejected(string name, string code)
    {
        Assert.Equal(code, Assert.Throws<ExportException>(() => Validator().Open(Fixture(name))).Code);
    }

    private static FormFile Fixture(string name) => File(System.IO.File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", name)));

    private static FormFile File(byte[] content) => new(new MemoryStream(content), 0, content.Length, "file", "test.pdf");

    private static void AssertRejected(int status, string code, Action open)
    {
        var error = Assert.Throws<ExportException>(open);
        Assert.Equal((status, code), (error.StatusCode, error.Code));
    }
}
