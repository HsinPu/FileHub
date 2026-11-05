import logo from '../assets/filehub-logo.png';

/** 名稱由外層品牌連結提供，圖案不重複加入可存取名稱。 */
export function BrandMark() {
  return <img className="workspace-logo" src={logo} width={40} height={40} alt="" aria-hidden="true" draggable={false}/>;
}
