import {DeploymentListParams, Stage} from "cloudflare/resources/pages/projects";

type StageStatus = Stage["status"]
type Environment = DeploymentListParams["env"]

interface FetchDeploymentOptions {
    env?: Environment,
}

interface AppConfig {
    apiToken: string,
    accountId: string,
    projectName: string,
    expirationHours: number,
    environment: Environment,
}