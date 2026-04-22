import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Scooter model functions
export async function getScooterModels() {
  try {
    console.log('Fetching scooter models from Supabase...');
    
    const { data, error } = await supabase
      .from('scooter_models')
      .select(`
        id,
        name,
        model_code,
        specs,
        base_price,
        current_pricing:scooter_pricing_history(
          pricing_type,
          price,
          min_period,
          max_period
        )
      `)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Supabase error:', error);
      throw new Error('Failed to fetch scooter models');
    }

    console.log('Received data from Supabase:', data);

    if (!data || data.length === 0) {
      console.log('No scooter models found');
      return [];
    }

    // Фильтруем pricing_history, чтобы получить только актуальные цены
    return data.map(model => ({
      ...model,
      current_pricing: model.current_pricing.filter(p => !p.effective_to)
    }));
  } catch (error) {
    console.error('Error in getScooterModels:', error);
    throw error;
  }
}

// Purchase calculator functions
export async function calculatePurchase(
  modelId: string,
  initialPayment: number,
  months: number
) {
  try {
    console.log('Calculating purchase plan:', { modelId, initialPayment, months });

    const { data: model } = await supabase
      .from('scooter_models')
      .select('base_price')
      .eq('id', modelId)
      .single();

    if (!model) {
      throw new Error('Model not found');
    }

    const { data: pricing } = await supabase
      .from('scooter_pricing_history')
      .select('price')
      .eq('model_id', modelId)
      .eq('pricing_type', 'daily')
      .is('effective_to', null)
      .single();

    if (!pricing) {
      throw new Error('Pricing not found');
    }

    const totalPrice = model.base_price;
    const monthlyPayment = (totalPrice - initialPayment) / months;
    const dailyRentalCost = pricing.price * 30 * months;
    const savings = dailyRentalCost - totalPrice;

    console.log('Purchase calculation result:', {
      totalPrice,
      monthlyPayment,
      dailyRentalCost,
      savings
    });

    return {
      total_price: totalPrice,
      monthly_payment: monthlyPayment,
      total_payment: totalPrice,
      savings: savings
    };
  } catch (error) {
    console.error('Error in calculatePurchase:', error);
    throw error;
  }
}