export interface RuneTacticalInfo {
  tip: string;
  synergyAdvice: string;
  recommendedPosition: string;
}

export const runeTacticalMap: Record<string, RuneTacticalInfo> = {
  spark_orb: {
    tip: '每回合首发点火引信，优先向右传递真气，是连锁阵型最基础稳定的启动器。',
    synergyAdvice: '与【折射镜】组合可直接打通第一排连锁通道。',
    recommendedPosition: '推荐布局在第 1 行第 1 格（格 1）或离火位。',
  },
  prism_right: {
    tip: '折射强力光束，激活自身时强制向右格传递能量，可反复被邻近符文重触发。',
    synergyAdvice: '与多段激活符文组合可实现指数级连锁循环。',
    recommendedPosition: '最宜置于第 1~2 列，向右射出高额连锁回路。',
  },
  relay_cross: {
    tip: '四向枢纽，激活时向上下左右四个正方向同时辐射连锁共鸣。',
    synergyAdvice: '是盘面中枢核心，与聚灵位或四周环绕增幅符文效果极佳。',
    recommendedPosition: '强烈推荐布阵在棋盘正中心（格 6、7、10、11）。',
  },
  overclock_core: {
    tip: '沸血暴烈，消耗微量代价将连锁深度推向极致，单次激活爆发力强。',
    synergyAdvice: '搭配增幅流【叠浪璧】或【燃烬印】可产生斩杀级高额输出。',
    recommendedPosition: '适合作为连锁回路末端的收割阵眼。',
  },
  venom_drop: {
    tip: '单发纯正剧毒，施加基础毒素层数，是剧毒流叠毒的核心基石。',
    synergyAdvice: '与【瘴气囊】和【催化胆】联动，能在前几轮快速将毒素堆积至千层。',
    recommendedPosition: '建议置于先发激活格，尽早给守门核心挂满毒。',
  },
  plague_spreader: {
    tip: '毒瘴蔓延，激活时向同行同列泼洒剧毒，叠毒效率极高。',
    synergyAdvice: '剧毒 3 件套与 5 件套共鸣下，每层毒素都能额外附加破防侵蚀。',
    recommendedPosition: '放置在十字中心格或离火位，成倍扩散毒雾。',
  },
  catalyst_flask: {
    tip: '百炼催化，根据敌人身上已有的剧毒层数按比例倍增，越到后期威力越呈几何级爆发。',
    synergyAdvice: '必须在大量毒素挂上后再激活；配合【蚀骨雷】实现终极剧毒核爆。',
    recommendedPosition: '务必放在中后段格（第 3~4 行），确保先行积累毒素。',
  },
  toxic_detonator: {
    tip: '引爆核心毒囊，将毒素瞬间转化为等额直伤而不清除毒层，剧毒流必拿斩杀器。',
    synergyAdvice: '对抗第 6 波【漏毒翁】和高波次 Boss 时可一击打空巨量血条。',
    recommendedPosition: '置于棋盘最底部收官阵位。',
  },
  copper_mine: {
    tip: '天然矿脉，每次激活稳定采掘金币，金币越充盈，后续符文加成越恐怖。',
    synergyAdvice: '搭配【贪欢鼎】与遗物【铜钱簿】，每回合稳吃利息并产出巨款。',
    recommendedPosition: '适合置于早期多频激活格或聚灵位。',
  },
  greed_amplifier: {
    tip: '万钱归宗，根据当前手头持有的金币总量获得超高额外伤害加成。',
    synergyAdvice: '手里留存 30~50 金时，单格伤害可飙升数倍，越有钱越无敌。',
    recommendedPosition: '适宜置于玄冰位，享受暴击与海量金币双重倍率。',
  },
  gold_cannon: {
    tip: '重金破阵，耗费微量金币轰出毁灭性重炮，专破 Boss 坚固护甲。',
    synergyAdvice: '对抗【铁壳卫】和【闭门王】时能强行撕裂减伤壁障。',
    recommendedPosition: '置于第 1 排（若持有磨刀石）或第 4 排。',
  },
  tax_collector: {
    tip: '财源滚滚，每当法阵激活时抽取金币反哺伤害，攻守兼备。',
    synergyAdvice: '配合金币 3/5 件套共鸣，过关利息与战斗收益全盘拉满。',
    recommendedPosition: '适合作为辅助阵眼，插在连锁回路侧翼。',
  },
  ember_amp: {
    tip: '薪火相传，为相邻符文提供持续的伤害倍率光环，激活次数越多倍率越高。',
    synergyAdvice: '增幅流基石，放在两个主力输出符文正中间。',
    recommendedPosition: '与主力输出符文紧密相邻放置。',
  },
  echo_stone: {
    tip: '共鸣回响，记录并放大本回合累计触发的总能量，连击越高增幅越夸张。',
    synergyAdvice: '在 15+ 高连击下，叠浪璧能将末端符文的输出提升至天际。',
    recommendedPosition: '绝对核心位，放在离火位可触发双重叠浪。',
  },
  blood_altar: {
    tip: '逆境求存，以极致暴击与临时倍率搏取绝境逆转，爆发力顶尖。',
    synergyAdvice: '放置在【玄冰位】（基础暴击+45%）时暴击率轻松突破 100%。',
    recommendedPosition: '锁定玄冰位，刀刀暴击刀刀烈火。',
  },
  combo_finisher: {
    tip: '终篇归墟，汇聚全盘连击之大成，连击数即是绝对力量。',
    synergyAdvice: '与连锁流和增幅 5 件套（终章绝啸）无缝融合，终极一锤定音。',
    recommendedPosition: '棋盘最后一格（格 16），全场最绚丽收尾。',
  },
  falling_bell: {
    tip: '重锤下落，垂直向下传导剧烈音波冲击，单列贯通压制。',
    synergyAdvice: '对抗第 8、11、15 波【石狮】时，置于中间两列可享受 1.1x 增伤。',
    recommendedPosition: '置于第 2 或第 3 列顶部，竖向一击到底。',
  },
  moss_brick: {
    tip: '古苔凝碧，慢热而绵长的剧毒结界，持续削弱敌人护甲抗性。',
    synergyAdvice: '搭配遗物【苔碗】与【化功散】，让回合末毒素结算伤害再上五成。',
    recommendedPosition: '适合置于角落或聚灵位慢慢汲取灵气。',
  },
  coin_mold: {
    tip: '开模铸币，激活时若相邻有同系金币符文，额外熔铸额外元宝。',
    synergyAdvice: '凑齐金币流 3 件套后，商店刷新与符文购买近乎零门槛。',
    recommendedPosition: '与聚宝盆和掷金铳拼成 2×2 阵列。',
  },
  red_seal: {
    tip: '丹书铁券，永久固化本阵暴击印记，并为下回合贮备强力法印。',
    synergyAdvice: '搭配遗物【朱砂镜】与【太虚神针】，暴击时附带纯阳破甲真伤。',
    recommendedPosition: '适合作为玄冰位的邻近共振源。',
  },
  toxic_fuse: {
    tip: '毒火相激，以剧毒为引点燃连锁烈焰，横跨剧毒与连锁双系混搭。',
    synergyAdvice: '双流派混搭打法的核心润滑剂，既能叠毒又能续接连锁步数。',
    recommendedPosition: '适合置于剧毒符文与连锁符文交界处。',
  },
  gilded_fang: {
    tip: '金玉其表，撕裂敌人气血的同时刮取散落金沙，高效兼顾伤害与敛财。',
    synergyAdvice: '配合遗物【紫金葫芦】，高连击下一局可白得数十金币。',
    recommendedPosition: '放在高频连锁路线上。',
  },
  storm_gambler: {
    tip: '狂飙怒涛，充满玄学变数的狂暴连锁，下限不低，上限突破天际。',
    synergyAdvice: '多段激活下总能摇出最高连锁乘数，逆风翻盘奇兵。',
    recommendedPosition: '放在第 1 行或离火位，让狂飙怒涛尽早开卷。',
  },
  blood_prism: {
    tip: '泣血神光，将增幅能量折射分化为双向光束，极度贪婪的几何法阵。',
    synergyAdvice: '能同时为横向与纵向两枚符文提供触发机会，连锁网络倍增器。',
    recommendedPosition: '放在棋盘第 2 行第 2 格（格 6），统治半张棋盘。',
  },
  alchemy_bell: {
    tip: '仙炉点金，清脆编钟激荡时将部分伤害直接炼化为永久财气。',
    synergyAdvice: '越早拿到越容易形成利滚利资本雪球，无尽模式长线神石。',
    recommendedPosition: '适合置于前两排多段激活区。',
  },
  plague_crown: {
    tip: '万毒归冕，史诗级剧毒至宝，让全场所有剧毒符文的效能永久升华。',
    synergyAdvice: '剧毒流终极毕业神符，配合 5 件套可将毒伤拉满至数亿级别。',
    recommendedPosition: '推荐置于聚灵位，永久威力增长与毒性相生相息。',
  },
};

export function getRuneTacticalInfo(configId: string): RuneTacticalInfo {
  return runeTacticalMap[configId] ?? {
    tip: '法阵古老符文，蕴含神秘天地伟力。',
    synergyAdvice: '与同流派符文组合可激活共鸣羁绊。',
    recommendedPosition: '依据阵眼属性与连锁走向灵活安置。',
  };
}
