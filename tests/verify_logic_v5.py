
import unittest
import math

def js_round(val):
    """等效于 JS 的 Math.round(val * 10) / 10"""
    return math.floor(val * 10 + 0.5) / 10

class NBGasLogicEngine:
    """Worker.js 核心逻辑的 Python 等效实现，用于离线验证算法"""
    
    def __init__(self, active_base, market_data, day_of_week):
        self.active_base = active_base
        self.market_data = market_data  # List of dicts: {'date':..., 'val':...}
        self.day_of_week = day_of_week  # 0=Sun, 1=Mon, ..., 4=Thu

    def calculate_prediction(self):
        if len(self.market_data) < 3:
            return {"error": "Insufficient data"}

        # 1. 7日均值 (常规预测)
        avg_7day = sum(d['val'] for d in self.market_data[:7]) / min(len(self.market_data), 7)
        prediction_change = (avg_7day - self.active_base) * 1.15
        
        # 2. 熔断逻辑 (Interrupter)
        interrupter_alert = False
        cumulative_drift = 0
        is_blackout = (self.day_of_week == 2 or self.day_of_week == 3)
        
        if not is_blackout:
            avg_3day = sum(d['val'] for d in self.market_data[:3]) / 3
            cumulative_drift = avg_3day - self.active_base
            if abs(cumulative_drift) >= 5.0:
                interrupter_alert = True
        
        return {
            "prediction": js_round(prediction_change),
            "interrupter": interrupter_alert,
            "drift": round(cumulative_drift, 2),
            "is_blackout": is_blackout
        }

class TestNBGasV5Logic(unittest.TestCase):
    
    def setUp(self):
        self.base = 100.0  # 假设 EUB 基准价格为 100 ¢

    def test_routine_thursday(self):
        """测试用例 1: 常规市场波动，无熔断"""
        # 模拟 7 天数据，均值为 103 (涨 3¢)，税后应涨 ~3.45¢ -> 3.5¢
        data = [{'val': 103.0}] * 7
        engine = NBGasLogicEngine(self.base, data, 1) # 周一
        res = engine.calculate_prediction()
        self.assertEqual(res['prediction'], 3.5)
        self.assertFalse(res['interrupter'])

    def test_interrupter_hike(self):
        """测试用例 2: 暴涨触发熔断"""
        # 最近 3 天均值 106 (偏离 6¢ > 5¢)
        data = [{'val': 106.0}] * 7
        engine = NBGasLogicEngine(self.base, data, 4) # 周四 (非静默期)
        res = engine.calculate_prediction()
        self.assertTrue(res['interrupter'])
        self.assertEqual(res['drift'], 6.0)

    def test_blackout_window(self):
        """测试用例 3: 静默期屏蔽熔断 (周二/周三)"""
        data = [{'val': 108.0}] * 7 # 巨大偏离
        # 周二 (2)
        engine = NBGasLogicEngine(self.base, data, 2)
        res = engine.calculate_prediction()
        self.assertFalse(res['interrupter'], "周二不应触发熔断")
        self.assertTrue(res['is_blackout'])

    def test_data_insufficiency(self):
        """测试用例 4: 数据不足处理"""
        data = [{'val': 100.0}] * 2
        engine = NBGasLogicEngine(self.base, data, 1)
        res = engine.calculate_prediction()
        self.assertIn("error", res)

if __name__ == "__main__":
    unittest.main()
