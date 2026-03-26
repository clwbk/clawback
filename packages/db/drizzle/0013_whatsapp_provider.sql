-- Add whatsapp to connection_provider enum.
ALTER TYPE "public"."connection_provider" ADD VALUE IF NOT EXISTS 'whatsapp';
