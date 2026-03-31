/*
  Warnings:

  - Added the required column `updatedAt` to the `alerts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "type" DROP DEFAULT;
