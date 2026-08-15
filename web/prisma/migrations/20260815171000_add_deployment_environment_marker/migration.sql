CREATE TABLE "CloverDeploymentEnvironment" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloverDeploymentEnvironment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CloverDeploymentEnvironment_environment_key"
ON "CloverDeploymentEnvironment"("environment");
