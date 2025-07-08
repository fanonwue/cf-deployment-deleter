import {AppConfig} from "./types";

export function parseIntOrDefault(raw: string, def: number): number {
    const parsed = parseInt(raw)
    if (isNaN(parsed)) return def
    return parsed
}

export function verifyConfig(config: AppConfig): boolean {
    let isValid = true

    const onError = (message: string) => {
        isValid = false
        console.error(message)
    }

    if (!config.apiToken) onError("API token is missing")
    if (!config.accountId) onError("Account ID is missing")
    if (!config.projectName) onError("Project name is missing")
    return isValid
}

export function toLoggingSafeConfig(config: AppConfig): AppConfig {
    const placeholder = "*****"
    return {
        ...config,
        apiToken: placeholder,
    }
}