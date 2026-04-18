const config = {
  allowedMessageOrigins: [] as string[],
  mapStyles: {
    light: {
      version: 8 as const,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background" as const,
          paint: { "background-color": "#ffffff" },
        },
      ],
    },
    dark: {
      version: 8 as const,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background" as const,
          paint: { "background-color": "#1a1a2e" },
        },
      ],
    },
  },
};

export default config;
