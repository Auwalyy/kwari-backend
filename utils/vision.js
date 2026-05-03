import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient({
  credentials: {
    client_email: process.env.GOOGLE_VISION_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_VISION_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  projectId: process.env.GOOGLE_VISION_PROJECT_ID,
});

/**
 * Analyze an image (buffer or public URL) and return
 * labels + dominant colors useful for fabric/textile search.
 */
export const analyzeImage = async (imageSource) => {
  const request = Buffer.isBuffer(imageSource)
    ? { image: { content: imageSource.toString("base64") } }
    : { image: { source: { imageUri: imageSource } } };

  const [labelResult, colorResult] = await Promise.all([
    client.labelDetection(request),
    client.imageProperties(request),
  ]);

  const labels = labelResult[0].labelAnnotations
    .filter((l) => l.score >= 0.7)
    .map((l) => l.description.toLowerCase());

  const colors = colorResult[0].imagePropertiesAnnotation?.dominantColors?.colors
    ?.slice(0, 3)
    .map((c) => {
      const { red = 0, green = 0, blue = 0 } = c.color;
      return rgbToColorName(red, green, blue);
    })
    .filter(Boolean) || [];

  return { labels, colors };
};

// Basic RGB → color name mapping for fabric colors
const rgbToColorName = (r, g, b) => {
  if (r > 200 && g < 80  && b < 80)  return "red";
  if (r < 80  && g < 80  && b > 200) return "blue";
  if (r < 80  && g > 150 && b < 80)  return "green";
  if (r > 200 && g > 200 && b < 80)  return "yellow";
  if (r > 200 && g > 100 && b < 80)  return "orange";
  if (r > 150 && g < 80  && b > 150) return "purple";
  if (r > 200 && g > 200 && b > 200) return "white";
  if (r < 60  && g < 60  && b < 60)  return "black";
  if (r > 120 && g > 80  && b < 60)  return "brown";
  if (r > 180 && g > 180 && b > 180) return "grey";
  return null;
};

export default client;
