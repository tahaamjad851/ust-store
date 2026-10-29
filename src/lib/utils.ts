import { createCn } from "cn/config"

// Register the design-system type scale (globals.css --text-*) as font sizes, so merging
// "text-label-lg" with a text colour keeps both instead of treating them as conflicting.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "headline-xl",
            "headline-xl-mobile",
            "headline-lg",
            "headline-lg-mobile",
            "headline-md",
            "headline-sm",
            "body-lg",
            "body-md",
            "body-sm",
            "label-lg",
            "label-md",
            "label-sm",
            "price-lg",
            "price-md",
          ],
        },
      ],
    },
  },
})
