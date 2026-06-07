using System.Text.Json;
using System.Text.Json.Serialization;

namespace GP;

public class AppData
{
    [JsonPropertyName("projects")]
    public List<JsonElement> Projects { get; set; } = [];

    [JsonPropertyName("tasks")]
    public Dictionary<string, List<JsonElement>> Tasks { get; set; } = [];
}

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };
}
