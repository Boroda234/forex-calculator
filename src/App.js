import React, { useState, useEffect } from "react";

const ForexRiskCalculator = () => {
  const [accountBalance, setAccountBalance] = useState("10000");
  const [riskPercentage, setRiskPercentage] = useState("2");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [currencyPair, setCurrencyPair] = useState("EURUSD");
  const [tradeDirection, setTradeDirection] = useState("buy");
  const [customPipSize, setCustomPipSize] = useState("");
  const [useAutoPipSize, setUseAutoPipSize] = useState(true);
  const [useExternalData, setUseExternalData] = useState(false);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [externalRates, setExternalRates] = useState({});

  const [results, setResults] = useState({
    riskAmount: 0,
    pipValue: 0,
    pipDistance: 0,
    positionSize: 0,
    potentialProfit: 0,
    riskRewardRatio: 0,
    pipSize: 0,
  });

  // Функция для получения актуальных курсов валют
  const fetchExchangeRates = async () => {
    setIsLoadingRates(true);
    try {
      // Используем бесплатный API для курсов валют
      const response = await fetch(
        "https://api.exchangerate-api.com/v4/latest/USD"
      );
      const data = await response.json();

      // Преобразуем данные в формат для наших расчетов
      const rates = {
        EURUSD: 1 / data.rates.EUR,
        GBPUSD: 1 / data.rates.GBP,
        USDCHF: data.rates.CHF,
        USDJPY: data.rates.JPY,
        AUDUSD: 1 / data.rates.AUD,
        USDCAD: data.rates.CAD,
        NZDUSD: 1 / data.rates.NZD,
        EURJPY: data.rates.JPY / data.rates.EUR,
        GBPJPY: data.rates.JPY / data.rates.GBP,
        // Для золота и индексов используем статичные значения или другой API
        XAUUSD: 2050.0,
        GER40: 17500.0,
      };

      setExternalRates(rates);
      setLastUpdated(new Date());

      // Дополнительно можно получить данные о золоте и индексах
      try {
        const goldResponse = await fetch(
          "https://api.metals.live/v1/spot/gold"
        );
        const goldData = await goldResponse.json();
        if (goldData && goldData[0] && goldData[0].price) {
          rates.XAUUSD = goldData[0].price;
        }
      } catch (goldError) {
        console.log("Не удалось получить цену золота:", goldError);
      }

      setExternalRates(rates);
    } catch (error) {
      console.error("Ошибка при получении курсов валют:", error);
      // При ошибке используем резервные данные
      setExternalRates({
        EURUSD: 1.085,
        GBPUSD: 1.265,
        USDCHF: 0.895,
        USDJPY: 149.5,
        AUDUSD: 0.675,
        USDCAD: 1.345,
        NZDUSD: 0.615,
        EURJPY: 161.2,
        GBPJPY: 188.5,
        XAUUSD: 2050.0,
        GER40: 17500.0,
      });
    } finally {
      setIsLoadingRates(false);
    }
  };

  // Функция для расчета точной стоимости пипса
  const calculatePipValue = (pair, lotSize = 1) => {
    // Используем внешние курсы если включено, иначе статичные
    const staticRates = {
      EURUSD: 1.085,
      GBPUSD: 1.265,
      USDCHF: 0.895,
      USDJPY: 149.5,
      AUDUSD: 0.675,
      USDCAD: 1.345,
      NZDUSD: 0.615,
      EURJPY: 161.2,
      GBPJPY: 188.5,
      XAUUSD: 2050.0,
      GER40: 17500.0,
    };

    const exchangeRates =
      useExternalData && Object.keys(externalRates).length > 0
        ? externalRates
        : staticRates;

    const rate = exchangeRates[pair] || 1;

    // Расчет стоимости пипса для разных типов пар
    if (pair === "XAUUSD") {
      // Золото - специальный расчет (пип = 0.1)
      return 1 * lotSize; // $1 за 0.1 пункт для стандартного лота
    } else if (pair === "GER40") {
      // Немецкий индекс DAX - CFD на индекс
      return 1 * lotSize; // $1 за пункт для стандартного лота
    } else if (pair.endsWith("USD")) {
      // Прямые пары (XXX/USD)
      return 10 * lotSize; // $10 за стандартный лот
    } else if (pair.startsWith("USD")) {
      // Обратные пары (USD/XXX)
      if (pair.includes("JPY")) {
        return (1000 / rate) * lotSize; // Для йены: 1000 йен / курс
      }
      return (10 / rate) * lotSize;
    } else if (pair.includes("JPY")) {
      // Кросс-пары с йеной
      return (1000 / rate) * lotSize; // Особый расчет для йены в кросс-парах
    } else {
      // Кросс-пары
      return 10 * lotSize; // Упрощенный расчет для кросс-пар
    }
  };

  const calculateRisk = () => {
    const balance = parseFloat(accountBalance);
    const risk = parseFloat(riskPercentage);
    const entry = parseFloat(entryPrice);
    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);

    if (!balance || !risk || !entry || !sl) return;

    // Расчет суммы риска
    const riskAmount = (balance * risk) / 100;

    // Расчет расстояния в пипсах до стоп-лосса
    let pipDistance;
    let pipSize;

    // Используем кастомный размер пипа или автоматический
    if (!useAutoPipSize && customPipSize) {
      pipSize = parseFloat(customPipSize);
    } else {
      // Автоматическое определение размера пипа
      if (currencyPair.includes("JPY")) {
        pipSize = 0.01; // Для всех пар с йеной пип = 0.01
      } else if (currencyPair === "XAUUSD") {
        pipSize = 0.1; // Для золота пип = 0.1
      } else if (currencyPair === "GER40") {
        pipSize = 1; // Для индекса пип = 1 пункт
      } else {
        pipSize = 0.0001; // Стандартный размер пипа
      }
    }

    if (tradeDirection === "buy") {
      pipDistance = Math.abs(entry - sl) / pipSize;
    } else {
      pipDistance = Math.abs(sl - entry) / pipSize;
    }

    // Точный расчет стоимости пипса
    const pipValue = calculatePipValue(currencyPair, 1);

    // Размер позиции в лотах
    const positionSize = riskAmount / (pipDistance * pipValue);

    // Потенциальная прибыль
    let potentialProfit = 0;
    let riskRewardRatio = 0;

    if (tp) {
      let profitPips;
      if (tradeDirection === "buy") {
        profitPips = Math.abs(tp - entry) / pipSize;
      } else {
        profitPips = Math.abs(entry - tp) / pipSize;
      }
      potentialProfit = profitPips * pipValue * positionSize;
      riskRewardRatio = potentialProfit / riskAmount;
    }

    setResults({
      riskAmount: riskAmount.toFixed(2),
      pipValue: pipValue.toFixed(2),
      pipDistance: pipDistance.toFixed(1),
      positionSize: positionSize.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      riskRewardRatio: riskRewardRatio.toFixed(2),
      pipSize: pipSize,
    });
  };

  useEffect(() => {
    calculateRisk();
  }, [
    accountBalance,
    riskPercentage,
    entryPrice,
    stopLoss,
    takeProfit,
    currencyPair,
    tradeDirection,
    customPipSize,
    useAutoPipSize,
    externalRates,
  ]);

  // Автоматическое обновление курсов при включении внешних данных
  useEffect(() => {
    if (useExternalData) {
      fetchExchangeRates();
      // Обновляем каждые 5 минут
      const interval = setInterval(fetchExchangeRates, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [useExternalData]);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            📊 Форекс Калькулятор Позиции и Риска
          </h1>
          <p className="text-gray-600 text-sm">
            Профессиональный инструмент для управления рисками в торговле
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Левая колонка - Ввод данных */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">
              Параметры торговли
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Баланс счета ($)
                </label>
                <input
                  type="number"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Риск на сделку (%)
                </label>
                <input
                  type="number"
                  value={riskPercentage}
                  onChange={(e) => setRiskPercentage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="2"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Валютная пара
                </label>
                <select
                  value={currencyPair}
                  onChange={(e) => setCurrencyPair(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EURUSD">EUR/USD</option>
                  <option value="GBPUSD">GBP/USD</option>
                  <option value="USDCHF">USD/CHF</option>
                  <option value="USDJPY">USD/JPY</option>
                  <option value="EURJPY">EUR/JPY</option>
                  <option value="GBPJPY">GBP/JPY</option>
                  <option value="AUDUSD">AUD/USD</option>
                  <option value="USDCAD">USD/CAD</option>
                  <option value="NZDUSD">NZD/USD</option>
                  <option value="XAUUSD">XAU/USD (Золото)</option>
                  <option value="GER40">GER40 (DAX)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Направление сделки
                </label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setTradeDirection("buy")}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      tradeDirection === "buy"
                        ? "bg-green-500 text-white shadow-md"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    🟢 Покупка
                  </button>
                  <button
                    onClick={() => setTradeDirection("sell")}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      tradeDirection === "sell"
                        ? "bg-red-500 text-white shadow-md"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    🔴 Продажа
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Цена входа
                </label>
                <input
                  type="number"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    currencyPair === "XAUUSD"
                      ? "2050.0"
                      : currencyPair === "GER40"
                      ? "17500"
                      : "1.1234"
                  }
                  step={
                    currencyPair === "XAUUSD"
                      ? "0.1"
                      : currencyPair === "GER40"
                      ? "1"
                      : "0.0001"
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Стоп-лосс
                </label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder={
                    currencyPair === "XAUUSD"
                      ? "2040.0"
                      : currencyPair === "GER40"
                      ? "17400"
                      : "1.1200"
                  }
                  step={
                    currencyPair === "XAUUSD"
                      ? "0.1"
                      : currencyPair === "GER40"
                      ? "1"
                      : "0.0001"
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Тейк-профит (опционально)
                </label>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder={
                    currencyPair === "XAUUSD"
                      ? "2070.0"
                      : currencyPair === "GER40"
                      ? "17700"
                      : "1.1300"
                  }
                  step={
                    currencyPair === "XAUUSD"
                      ? "0.1"
                      : currencyPair === "GER40"
                      ? "1"
                      : "0.0001"
                  }
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Источник данных
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="external-data"
                          checked={useExternalData}
                          onChange={(e) => setUseExternalData(e.target.checked)}
                          className="text-blue-500"
                        />
                        <label
                          htmlFor="external-data"
                          className="text-sm text-gray-700"
                        >
                          🌐 Использовать актуальные курсы из интернета
                        </label>
                      </div>
                      {useExternalData && (
                        <button
                          onClick={fetchExchangeRates}
                          disabled={isLoadingRates}
                          className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                          {isLoadingRates ? "🔄" : "↻"} Обновить
                        </button>
                      )}
                    </div>

                    {useExternalData && lastUpdated && (
                      <div className="text-xs text-gray-500 text-center">
                        📡 Последнее обновление:{" "}
                        {lastUpdated.toLocaleTimeString("ru-RU")}
                        <br />
                        Автообновление каждые 5 минут
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Размер пипа
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="auto-pip"
                        checked={useAutoPipSize}
                        onChange={() => setUseAutoPipSize(true)}
                        className="text-blue-500"
                      />
                      <label
                        htmlFor="auto-pip"
                        className="text-sm text-gray-700"
                      >
                        🤖 Автоматически (
                        {currencyPair.includes("JPY")
                          ? "0.01"
                          : currencyPair === "XAUUSD"
                          ? "0.1"
                          : currencyPair === "GER40"
                          ? "1"
                          : "0.0001"}
                        )
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="custom-pip"
                        checked={!useAutoPipSize}
                        onChange={() => setUseAutoPipSize(false)}
                        className="text-blue-500"
                      />
                      <label
                        htmlFor="custom-pip"
                        className="text-sm text-gray-700"
                      >
                        ⚙️ Настроить вручную
                      </label>
                    </div>
                    {!useAutoPipSize && (
                      <input
                        type="number"
                        value={customPipSize}
                        onChange={(e) => setCustomPipSize(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ml-6"
                        placeholder="0.0001"
                        step="0.0001"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Правая колонка - Результаты */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">
              Результаты расчета
            </h2>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2 flex items-center">
                  💰 Управление риском
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Сумма риска:</span>
                    <span className="font-bold text-red-600">
                      ${results.riskAmount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Расстояние до SL:</span>
                    <span>
                      {results.pipDistance}{" "}
                      {currencyPair === "GER40" ? "пунктов" : "пипсов"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2 flex items-center">
                  📈 Размер позиции
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Размер позиции:</span>
                    <span className="font-bold text-blue-600">
                      {results.positionSize} лотов
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Стоимость пипса:</span>
                    <span>${results.pipValue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Размер пипа:</span>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {results.pipSize === 1 ? "1.0" : results.pipSize}
                      {!useAutoPipSize
                        ? " 🔧"
                        : useExternalData
                        ? " 🌐"
                        : " 🤖"}
                    </span>
                  </div>
                  {useExternalData && (
                    <div className="flex justify-between">
                      <span>Курс валют:</span>
                      <span className="text-xs text-gray-500">
                        {isLoadingRates ? "⏳ Загрузка..." : "🌐 Актуальный"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {takeProfit && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2 flex items-center">
                    🎯 Потенциальная прибыль
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Прибыль:</span>
                      <span className="font-bold text-green-600">
                        ${results.potentialProfit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Соотношение R/R:</span>
                      <span
                        className={`font-bold ${
                          parseFloat(results.riskRewardRatio) >= 2
                            ? "text-green-600"
                            : parseFloat(results.riskRewardRatio) >= 1
                            ? "text-orange-600"
                            : "text-red-600"
                        }`}
                      >
                        1:{results.riskRewardRatio}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center">
                  📋 Сводка сделки
                </h3>
                <div className="text-xs text-gray-600 space-y-1">
                  <p>
                    • Валютная пара: <strong>{currencyPair}</strong>
                  </p>
                  <p>
                    • Направление:{" "}
                    <strong>
                      {tradeDirection === "buy" ? "Покупка" : "Продажа"}
                    </strong>
                  </p>
                  <p>
                    • Риск: <strong>{riskPercentage}%</strong> от капитала
                  </p>
                  {parseFloat(results.riskRewardRatio) > 0 && (
                    <p
                      className={
                        parseFloat(results.riskRewardRatio) >= 2
                          ? "text-green-600"
                          : "text-orange-600"
                      }
                    >
                      •{" "}
                      {parseFloat(results.riskRewardRatio) >= 2
                        ? "✅ Отличное"
                        : parseFloat(results.riskRewardRatio) >= 1
                        ? "⚠️ Приемлемое"
                        : "❌ Плохое"}{" "}
                      соотношение риск/прибыль
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">
              ℹ️ Как рассчитывается стоимость пипса:
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>
                • <strong>Прямые пары (XXX/USD):</strong> $10 за стандартный лот
              </li>
              <li>
                • <strong>Обратные пары (USD/XXX):</strong> $10 / текущий курс
              </li>
              <li>
                • <strong>Пары с JPY:</strong> пип = 0.01, стоимость = 1000 йен
                / курс
              </li>
              <li>
                • <strong>XAU/USD (Золото):</strong> пип = 0.1, $1 за пип
              </li>
              <li>
                • <strong>GER40 (DAX):</strong> пип = 1 пункт, $1 за пункт
              </li>
              <li>
                • <strong>Обычные пары:</strong> пип = 0.0001, $10 за лот
              </li>
              <li>
                • <strong>Настройка:</strong> можно задать кастомный размер пипа
              </li>
              <li>
                • <strong>Кросс-пары:</strong> расчет через USD эквивалент
              </li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">
              ⚠️ Важные замечания:
            </h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>
                •{" "}
                {useExternalData
                  ? "Курсы обновляются автоматически каждые 5 минут"
                  : "Используются статичные курсы валют"}
              </li>
              <li>• Расчеты могут отличаться от значений вашего брокера</li>
              <li>• Всегда проверяйте расчеты на своей торговой платформе</li>
              <li>• Рекомендуется риск не более 1-2% на сделку</li>
              <li>• Соотношение риск/прибыль должно быть не менее 1:2</li>
              {useExternalData && (
                <li>
                  • API данные: exchangerate-api.com (валюты), metals.live
                  (золото)
                </li>
              )}
            </ul>
          </div>
        </div>

        <footer className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
          <p>
            © 2025 Форекс Калькулятор | Инструмент для профессионального
            управления рисками
          </p>
        </footer>
      </div>
    </div>
  );
};

export default ForexRiskCalculator;
