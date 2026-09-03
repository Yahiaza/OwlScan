using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OwlScan.Scanner;

internal sealed record ScannerDevice(string Id, string Name, string? Description, string Source = "WIA");
internal sealed record ScannerFile(string Path);
internal sealed record ServiceResponse<T>(bool Ok, T? Data = default, string? Error = null, bool Canceled = false);

internal static class Program
{
    private const int ScannerDeviceType = 1;
    private const int WiaIpsCurIntent = 6146;
    private const int WiaIpsXRes = 6147;
    private const int WiaIpsYRes = 6148;
    private const int WiaDpsDocumentHandlingSelect = 3088;
    private const int Feeder = 1;
    private const int Duplex = 4;
    private const string PngFormat = "{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (!OperatingSystem.IsWindows()) return Write(new ServiceResponse<object>(false, Error: "WIA is available on Windows only."));
            if (args.Length == 0) return Write(new ServiceResponse<object>(false, Error: "Missing command."));

            return args[0].ToLowerInvariant() switch
            {
                "health" => Write(new ServiceResponse<object>(true, new { service = "OwlScan.Scanner", protocol = 1 })),
                "devices" => Write(new ServiceResponse<List<ScannerDevice>>(true, ListDevices())),
                "scan" => Scan(args.Skip(1).ToArray()),
                _ => Write(new ServiceResponse<object>(false, Error: $"Unknown command: {args[0]}"))
            };
        }
        catch (COMException exception) when ((uint)exception.HResult is 0x80210064 or 0x800704C7)
        {
            return Write(new ServiceResponse<object>(false, Error: "Scan canceled.", Canceled: true));
        }
        catch (Exception exception)
        {
            return Write(new ServiceResponse<object>(false, Error: exception.Message));
        }
    }

    private static List<ScannerDevice> ListDevices()
    {
        var devices = new List<ScannerDevice>();
        var managerType = Type.GetTypeFromProgID("WIA.DeviceManager")
            ?? throw new InvalidOperationException("Windows Image Acquisition is unavailable.");
        dynamic? manager = null;

        try
        {
            manager = Activator.CreateInstance(managerType);
            foreach (dynamic info in manager!.DeviceInfos)
            {
                try
                {
                    if ((int)info.Type != ScannerDeviceType) continue;
                    string id = info.DeviceID;
                    string name = ReadProperty(info.Properties, "Name") ?? "WIA Scanner";
                    string? description = ReadProperty(info.Properties, "Description");
                    devices.Add(new ScannerDevice(id, name, description));
                }
                finally
                {
                    ReleaseCom(info);
                }
            }
        }
        finally
        {
            ReleaseCom(manager);
        }

        return devices;
    }

    private static int Scan(string[] args)
    {
        var options = ParseOptions(args);
        if (!options.TryGetValue("output", out var output) || string.IsNullOrWhiteSpace(output))
            return Write(new ServiceResponse<object>(false, Error: "Missing --output."));

        var dpi = options.TryGetValue("dpi", out var dpiText) && int.TryParse(dpiText, out var parsedDpi) ? parsedDpi : 300;
        var color = options.GetValueOrDefault("color", "color");
        var duplex = bool.TryParse(options.GetValueOrDefault("duplex"), out var parsedDuplex) && parsedDuplex;
        var deviceId = options.GetValueOrDefault("device");

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
        if (File.Exists(output)) File.Delete(output);

        try
        {
            AcquireDirect(deviceId, output, dpi, color, duplex);
        }
        catch
        {
            AcquireWithDriverUi(output, color);
        }

        return Write(new ServiceResponse<ScannerFile>(true, new ScannerFile(Path.GetFullPath(output))));
    }

    private static void AcquireDirect(string? deviceId, string output, int dpi, string color, bool duplex)
    {
        var managerType = Type.GetTypeFromProgID("WIA.DeviceManager")!;
        dynamic? manager = null;
        dynamic? selectedInfo = null;
        dynamic? device = null;
        dynamic? item = null;
        dynamic? image = null;

        try
        {
            manager = Activator.CreateInstance(managerType);
            foreach (dynamic info in manager!.DeviceInfos)
            {
                if ((int)info.Type == ScannerDeviceType && (string.IsNullOrWhiteSpace(deviceId) || (string)info.DeviceID == deviceId))
                {
                    selectedInfo = info;
                    break;
                }
                ReleaseCom(info);
            }

            if (selectedInfo is null) throw new InvalidOperationException("No WIA scanner was found.");
            device = selectedInfo.Connect();
            TryWriteProperty(device.Properties, WiaDpsDocumentHandlingSelect, duplex ? Feeder | Duplex : Feeder);
            item = device.Items[1];
            TryWriteProperty(item.Properties, WiaIpsCurIntent, IntentFor(color));
            TryWriteProperty(item.Properties, WiaIpsXRes, dpi);
            TryWriteProperty(item.Properties, WiaIpsYRes, dpi);
            image = item.Transfer(PngFormat);
            image.SaveFile(Path.GetFullPath(output));
        }
        finally
        {
            ReleaseCom(image);
            ReleaseCom(item);
            ReleaseCom(device);
            ReleaseCom(selectedInfo);
            ReleaseCom(manager);
        }
    }

    private static void AcquireWithDriverUi(string output, string color)
    {
        var dialogType = Type.GetTypeFromProgID("WIA.CommonDialog")
            ?? throw new InvalidOperationException("WIA scan dialog is unavailable.");
        dynamic? dialog = null;
        dynamic? image = null;
        try
        {
            dialog = Activator.CreateInstance(dialogType);
            image = dialog!.ShowAcquireImage(ScannerDeviceType, IntentFor(color), 0, PngFormat, true, true, false);
            if (image is null) throw new COMException("Scan canceled.", unchecked((int)0x80210064));
            image.SaveFile(Path.GetFullPath(output));
        }
        finally
        {
            ReleaseCom(image);
            ReleaseCom(dialog);
        }
    }

    private static int IntentFor(string color) => color.ToLowerInvariant() switch
    {
        "bw" => 4,
        "gray" => 2,
        _ => 1
    };

    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            if (!args[index].StartsWith("--", StringComparison.Ordinal)) continue;
            var name = args[index][2..];
            var value = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal)
                ? args[++index]
                : "true";
            result[name] = value;
        }
        return result;
    }

    private static string? ReadProperty(dynamic properties, string name)
    {
        foreach (dynamic property in properties)
        {
            try
            {
                if (string.Equals((string)property.Name, name, StringComparison.OrdinalIgnoreCase))
                    return Convert.ToString(property.Value);
            }
            finally
            {
                ReleaseCom(property);
            }
        }
        return null;
    }

    private static void TryWriteProperty(dynamic properties, int propertyId, object value)
    {
        try
        {
            dynamic property = properties[propertyId.ToString()];
            property.Value = value;
            ReleaseCom(property);
        }
        catch (COMException)
        {
            // Some drivers expose a read-only value or do not support the property.
        }
    }

    private static void ReleaseCom(object? value)
    {
        if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
    }

    private static int Write<T>(ServiceResponse<T> response)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, JsonOptions));
        return response.Ok || response.Canceled ? 0 : 1;
    }
}
