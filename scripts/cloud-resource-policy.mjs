export const allDeploymentTargets = [
  'main',
  'canvas',
  'serve',
  'api',
  'web',
];

const stagingSleepPolicy = {
  'flownote-main': true,
  'flownote-canvas': true,
  'flownote-sub': true,
  'flownote-ai': true,
  'flownote-api': true,
  mobile: true,
  expo: true,
};

const productionSleepPolicy = Object.fromEntries(
  Object.keys(stagingSleepPolicy).map(service => [service, false]),
);

export function serviceSleepPolicy(environment) {
  if (environment === 'staging') return { ...stagingSleepPolicy };
  if (environment === 'production') return { ...productionSleepPolicy };
  throw new Error(`Unsupported cloud environment: ${environment}`);
}

export function mainResourceVariables(environment) {
  if (!['staging', 'production'].includes(environment)) {
    throw new Error(`Unsupported cloud environment: ${environment}`);
  }
  return {
    JAVA_TOOL_OPTIONS: '-Xms32m -Xmx256m -XX:+UseSerialGC -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=64m -XX:+ExitOnOutOfMemoryError',
    SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE: environment === 'staging' ? '0' : '1',
    SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: environment === 'staging' ? '4' : '5',
    SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT: environment === 'staging' ? '30000' : '60000',
    SPRING_DATASOURCE_HIKARI_KEEPALIVE_TIME: '0',
  };
}
