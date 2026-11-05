import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/** 量測本案純色文字、邊界與焦點的實際對比；透明背景逐層合成，不接受漸層或 opacity。 */
export async function expectReadable(locator: Locator, property: 'color' | 'borderTopColor' | 'outlineColor' = 'color', minimum = 4.5) {
  const transitions = await locator.evaluate(async element => {
    const animations: Animation[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) animations.push(...current.getAnimations());
    const count = animations.length;
    await Promise.allSettled(animations.map(animation => animation.finished));
    return count;
  });
  const ratio = await locator.evaluate((element, property) => {
    type RGB = [number, number, number];
    type RGBA = [number, number, number, number];
    const parse = (value: string): RGBA => {
      const [red, green, blue, alpha = 1] = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (red === undefined || green === undefined || blue === undefined || !value.startsWith('rgb')) throw new Error('未支援的對比色表示法');
      return [red, green, blue, alpha];
    };
    const over = ([red, green, blue, alpha]: RGBA, back: RGB): RGB => [red * alpha + back[0] * (1 - alpha), green * alpha + back[1] * (1 - alpha), blue * alpha + back[2] * (1 - alpha)];
    const layers: RGBA[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.opacity !== '1' || style.backgroundImage !== 'none') throw new Error('本量測不適用透明度或漸層');
      layers.unshift(parse(style.backgroundColor));
    }
    const background = layers.reduce<RGB>((result, layer) => over(layer, result), [255, 255, 255]);
    const foreground = over(parse(getComputedStyle(element)[property]), background);
    const linear = (value: number) => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4;
    const luminance = (color: RGB) => linear(color[0]) * .2126 + linear(color[1]) * .7152 + linear(color[2]) * .0722;
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }, property);
  console.info(JSON.stringify({property,contrast:ratio,settledAnimations:transitions}));
  expect(ratio).toBeGreaterThanOrEqual(minimum);
}
