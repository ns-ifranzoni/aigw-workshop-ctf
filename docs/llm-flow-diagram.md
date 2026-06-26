# LLM Request Flow — Direct vs Secured

```mermaid
sequenceDiagram
    participant ST as Student
    participant BE as Backend
    participant GW as AI Gateway<br/>(Netskope)
    participant LLM as LLM Provider

    ST->>BE: POST /api/chat/conversations/{id}/send<br/>{ message, model, provider_name, route_mode } + JWT

    BE->>BE: Validate JWT & identify participant

    alt route_mode = 'direct'

        BE->>BE: Load provider config from DB<br/>(schema, host, api_token)

        note over BE,LLM: Request goes directly to provider — no gateway

        BE->>LLM: API call with provider credentials<br/>(e.g. x-api-key / Authorization: Bearer)
        LLM-->>BE: LLM response
        BE->>BE: Save message<br/>increment prompt_count_direct
        BE-->>ST: { message, prompt_count }

    else route_mode = 'secured'

        note over BE,GW: Request proxied through Netskope AI Gateway

        BE->>GW: POST {gatewayUrl}/v1/{provider}/v1/chat/completions<br/>x-ns-aig-apikey: {participant_api_key}
        GW->>GW: Apply policies<br/>(DLP · guardrails · access control · logging)

        alt Budget / policy blocks request
            GW-->>BE: 403 / policy violation / 429 budget exceeded
            BE-->>ST: Error response
        else Request allowed
            GW->>LLM: Forward request to LLM provider
            LLM-->>GW: LLM response
            GW->>GW: Log activity & update usage
            GW-->>BE: Response (with gateway headers)
            BE->>BE: Save message<br/>increment prompt_count_secured
            BE-->>ST: { message, prompt_count }
        end

    end
```

## Comparación de flujos

| | Direct | Secured |
|---|---|---|
| **Ruta** | Student → Backend → LLM | Student → Backend → AI Gateway → LLM |
| **Auth al LLM** | API key del proveedor (en DB) | `x-ns-aig-apikey` del participante |
| **Políticas DLP** | ✗ No aplican | ✓ Evaluadas en el gateway |
| **Guardrails** | ✗ No aplican | ✓ Evaluados en el gateway |
| **Activity logging** | Solo en DB local | En gateway + DB local |
| **Counter** | `prompt_count_direct` | `prompt_count_secured` |
| **Credenciales expuestas** | API key real del proveedor | Token Netskope del participante |
