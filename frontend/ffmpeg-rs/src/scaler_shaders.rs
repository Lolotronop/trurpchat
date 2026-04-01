use windows::Win32::Graphics::Direct3D::Fxc::*;
use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D11::*;
use windows::core::*;

fn compile_shader(shader_code: &str, entry_point: &str, target: &str) -> Result<ID3DBlob> {
    let mut blob: Option<ID3DBlob> = None;
    let mut error_blob: Option<ID3DBlob> = None;

    unsafe {
        D3DCompile(
            shader_code.as_ptr() as *const _,
            shader_code.len(),
            None, // source name
            None, // defines
            None, // includes
            PCSTR(format!("{}\0", entry_point).as_ptr()),
            PCSTR(format!("{}\0", target).as_ptr()),
            D3DCOMPILE_ENABLE_STRICTNESS,
            0,
            &mut blob,
            Some(&mut error_blob),
        )?;
    }

    if let Some(error) = error_blob {
        unsafe {
            let msg = std::slice::from_raw_parts(
                error.GetBufferPointer() as *const u8,
                error.GetBufferSize(),
            );
            eprintln!("Shader compilation error: {}", String::from_utf8_lossy(msg));
        }
    }

    blob.ok_or_else(|| Error::empty())
}
// Create and set up shaders
pub fn setup_shaders(device: &ID3D11Device, context: &ID3D11DeviceContext) -> Result<()> {
    // Vertex Shader
    let vs_code = r#"
        struct VSOutput {
            float4 position : SV_POSITION;
            float2 texcoord : TEXCOORD0;
        };
        VSOutput main(uint id : SV_VertexID) {
            VSOutput output;
            output.texcoord = float2((id << 1) & 2, id & 2);
            output.position = float4(output.texcoord * float2(2, -2) + float2(-1, 1), 0, 1);
            return output;
        }
    "#;

    let vs_blob = compile_shader(vs_code, "main", "vs_5_0")?;
    let vs_bytes = unsafe {
        std::slice::from_raw_parts(
            vs_blob.GetBufferPointer() as *const u8,
            vs_blob.GetBufferSize(),
        )
    };
    let vertex_shader: ID3D11VertexShader = unsafe {
        let mut shader: Option<ID3D11VertexShader> = None;
        device.CreateVertexShader(vs_bytes, None, Some(&mut shader))?;
        shader.expect("Failed to create vertex shader")
    };

    // Pixel Shader
    let ps_code = r#"
        Texture2D sourceTexture : register(t0);
        SamplerState sourceSampler : register(s0);
        float4 main(float4 position : SV_POSITION, float2 texcoord : TEXCOORD0) : SV_TARGET {
            return sourceTexture.Sample(sourceSampler, texcoord);
        }
    "#;

    let ps_blob = compile_shader(ps_code, "main", "ps_5_0")?;
    let ps_bytes = unsafe {
        std::slice::from_raw_parts(
            ps_blob.GetBufferPointer() as *const u8,
            ps_blob.GetBufferSize(),
        )
    };
    let pixel_shader: ID3D11PixelShader = unsafe {
        let mut shader: Option<ID3D11PixelShader> = None;
        device.CreatePixelShader(ps_bytes, None, Some(&mut shader))?;
        shader.expect("Failed to create pixel shader")
    };

    // Bind shaders to pipeline
    unsafe {
        context.VSSetShader(Some(&vertex_shader), None);
        context.PSSetShader(Some(&pixel_shader), None);

        // We don't need an input layout since we're using SV_VertexID
        context.IASetInputLayout(None);

        // Set primitive topology
        context.IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    }

    Ok(())
}

pub fn calculate_viewport(
    src_width: u32,
    src_height: u32,
    target_width: u32,
    target_height: u32,
) -> D3D11_VIEWPORT {
    let target_width = target_width as f32;
    let target_height = target_height as f32;

    let src_aspect = src_width as f32 / src_height as f32;
    let target_aspect = target_width / target_height;

    let (width, height, x, y) = if src_aspect > target_aspect {
        // Source is wider - fit to width
        let w = target_width;
        let h = target_width / src_aspect;
        let y_offset = (target_height - h) / 2.0;
        (w, h, 0.0, y_offset)
    } else {
        // Source is taller - fit to height
        let h = target_height;
        let w = target_height * src_aspect;
        let x_offset = (target_width - w) / 2.0;
        (w, h, x_offset, 0.0)
    };

    D3D11_VIEWPORT {
        TopLeftX: x,
        TopLeftY: y,
        Width: width,
        Height: height,
        MinDepth: 0.0,
        MaxDepth: 1.0,
    }
}
